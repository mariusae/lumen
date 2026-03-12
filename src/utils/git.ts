import git, { TREE } from "isomorphic-git"
import http from "isomorphic-git/http/web"
import { GitHubRepository, GitHubUser } from "../schema"
import { fs, fsWipe } from "./fs"
import { resolveConflicts } from "./resolve-conflicts"
import { startTimer } from "./timer"

export const REPO_DIR = "/repo"
export const DEFAULT_BRANCH = "main"

export async function gitClone(repo: GitHubRepository, user: GitHubUser) {
  const options: Parameters<typeof git.clone>[0] = {
    fs,
    http,
    dir: REPO_DIR,
    // corsProxy: "https://cors.isomorphic-git.org",
    corsProxy: "/cors-proxy",
    url: `https://github.com/${repo.owner}/${repo.name}`,
    ref: DEFAULT_BRANCH,
    singleBranch: true,
    depth: 1,
    onMessage: (message) => console.debug("onMessage", message),
    onProgress: (progress) => console.debug("onProgress", progress),
    onAuth: () => ({ username: user.login, password: user.token }),
  }

  // Wipe file system
  // TODO: Only remove the repo directory instead of wiping the entire file system
  // Blocked by https://github.com/isomorphic-git/lightning-fs/issues/71
  fsWipe()

  // Clone repo
  let stopTimer = startTimer(`git clone ${options.url} ${options.dir}`)
  await git.clone(options)
  stopTimer()

  // Set user in git config
  stopTimer = startTimer(`git config user.name "${user.name}"`)
  await git.setConfig({ fs, dir: REPO_DIR, path: "user.name", value: user.name })
  stopTimer()

  // Set email in git config
  stopTimer = startTimer(`git config user.email "${user.email}"`)
  await git.setConfig({ fs, dir: REPO_DIR, path: "user.email", value: user.email })
  stopTimer()
}

export async function gitPull(user: GitHubUser) {
  const options: Parameters<typeof git.pull>[0] = {
    fs,
    http,
    dir: REPO_DIR,
    singleBranch: true,
    onMessage: (message) => console.debug("onMessage", message),
    onProgress: (progress) => console.debug("onProgress", progress),
    onAuth: () => ({ username: user.login, password: user.token }),
  }

  const stopTimer = startTimer("git pull")
  await git.pull(options)
  stopTimer()
}

export async function gitPush(user: GitHubUser) {
  const options: Parameters<typeof git.push>[0] = {
    fs,
    http,
    dir: REPO_DIR,
    onMessage: (message) => console.debug("onMessage", message),
    onProgress: (progress) => console.debug("onProgress", progress),
    onAuth: () => ({ username: user.login, password: user.token }),
  }

  const stopTimer = startTimer("git push")
  await git.push(options)
  stopTimer()
}

export async function gitAdd(filePaths: string[]) {
  const options: Parameters<typeof git.add>[0] = {
    fs,
    dir: REPO_DIR,
    filepath: filePaths,
  }

  const stopTimer = startTimer(`git add ${filePaths.join(" ")}`)
  await git.add(options)
  stopTimer()
}

export async function gitRemove(filePath: string) {
  const options: Parameters<typeof git.remove>[0] = {
    fs,
    dir: REPO_DIR,
    filepath: filePath,
  }

  const stopTimer = startTimer(`git remove ${filePath}`)
  await git.remove(options)
  stopTimer()
}

export async function gitCommit(message: string) {
  const options: Parameters<typeof git.commit>[0] = {
    fs,
    dir: REPO_DIR,
    message,
  }

  const stopTimer = startTimer(`git commit -m "${message}"`)
  await git.commit(options)
  stopTimer()
}

/** Check if the repo is synced with the remote origin */
export async function isRepoSynced() {
  const latestLocalCommit = await git.resolveRef({
    fs,
    dir: REPO_DIR,
    ref: `refs/heads/${DEFAULT_BRANCH}`,
  })

  const latestRemoteCommit = await git.resolveRef({
    fs,
    dir: REPO_DIR,
    ref: `refs/remotes/origin/${DEFAULT_BRANCH}`,
  })

  const isSynced = latestLocalCommit === latestRemoteCommit

  return isSynced
}

export async function getRemoteOriginUrl() {
  // Check git config for remote origin url
  const remoteOriginUrl = await git.getConfig({
    fs,
    dir: REPO_DIR,
    path: "remote.origin.url",
  })

  return remoteOriginUrl
}

async function gitFetch(user: GitHubUser) {
  const stopTimer = startTimer("git fetch")
  await git.fetch({
    fs,
    http,
    dir: REPO_DIR,
    singleBranch: true,
    onAuth: () => ({ username: user.login, password: user.token }),
  })
  stopTimer()
}

/** Read all files from a specific commit's tree */
async function readFilesFromCommit(oid: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {}
  await git.walk({
    fs,
    dir: REPO_DIR,
    trees: [TREE({ ref: oid })],
    map: async (filepath, [entry]) => {
      if (!entry) return null
      if (filepath === ".") return null
      if (filepath.startsWith(".git")) return null

      const type = await entry.type()
      if (type !== "blob") return null

      const content = await entry.content()
      if (!content) return null

      files[filepath] = new TextDecoder().decode(content)
      return null
    },
  })
  return files
}

/** Get the committer timestamp (in ms) from a commit */
async function getCommitTimestamp(oid: string): Promise<number> {
  const { commit } = await git.readCommit({ fs, dir: REPO_DIR, oid })
  return commit.committer.timestamp * 1000
}

/**
 * Check if a push error is a non-fast-forward rejection.
 * isomorphic-git throws a PushRejectedError with the error code 'PushRejectedError'.
 */
function isPushRejected(error: unknown): boolean {
  if (error instanceof Error) {
    // isomorphic-git uses the `code` property for error classification
    const code = (error as Error & { code?: string }).code
    if (code === "PushRejectedError") return true
    // Also catch the generic "not a simple fast-forward" message
    if (error.message.includes("not a simple fast-forward")) return true
  }
  return false
}

const MAX_REBASE_RETRIES = 3

/**
 * Push with automatic rebase on conflict.
 *
 * If the push is rejected (non-fast-forward), fetches remote changes,
 * resolves conflicts using updated_at frontmatter timestamps (falling back
 * to commit timestamps), and retries the push.
 *
 * Returns the new set of markdown files if a rebase occurred, so the caller
 * can update the in-memory state.
 */
export async function gitPushWithRebase(
  user: GitHubUser,
): Promise<{ markdownFiles?: Record<string, string> }> {
  // First attempt: try a normal push
  try {
    await gitPush(user)
    return {}
  } catch (error) {
    if (!isPushRejected(error)) throw error
  }

  // Push was rejected — perform manual rebase
  for (let attempt = 1; attempt <= MAX_REBASE_RETRIES; attempt++) {
    console.debug(`Rebase attempt ${attempt}/${MAX_REBASE_RETRIES}`)

    // Save local HEAD before fetching
    const localOid = await git.resolveRef({ fs, dir: REPO_DIR, ref: "HEAD" })

    // Fetch latest remote
    await gitFetch(user)
    const remoteOid = await git.resolveRef({
      fs,
      dir: REPO_DIR,
      ref: `refs/remotes/origin/${DEFAULT_BRANCH}`,
    })

    // If already in sync, nothing to do
    if (localOid === remoteOid) return {}

    // Read file trees from both commits
    const localFiles = await readFilesFromCommit(localOid)
    const remoteFiles = await readFilesFromCommit(remoteOid)

    // Get commit timestamps for fallback resolution
    const localCommitTs = await getCommitTimestamp(localOid)
    const remoteCommitTs = await getCommitTimestamp(remoteOid)

    // Resolve conflicts
    const { resolved, deletedFromRemote } = resolveConflicts(
      localFiles,
      remoteFiles,
      localCommitTs,
      remoteCommitTs,
    )

    // Fast-forward local branch to remote HEAD
    await git.writeRef({
      fs,
      dir: REPO_DIR,
      ref: `refs/heads/${DEFAULT_BRANCH}`,
      value: remoteOid,
      force: true,
    })

    // Checkout the remote HEAD into the working directory
    await git.checkout({ fs, dir: REPO_DIR, ref: DEFAULT_BRANCH, force: true })

    // Apply resolved changes on top of remote
    const hasChanges = Object.keys(resolved).length > 0 || deletedFromRemote.length > 0

    if (hasChanges) {
      // Write resolved files
      for (const [filepath, content] of Object.entries(resolved)) {
        // Create directories if needed
        const dirPath = filepath.split("/").slice(0, -1).join("/")
        if (dirPath) {
          let currentPath = REPO_DIR
          for (const segment of dirPath.split("/")) {
            currentPath = `${currentPath}/${segment}`
            const exists = await fs.promises.stat(currentPath).catch(() => null)
            if (!exists) await fs.promises.mkdir(currentPath)
          }
        }
        await fs.promises.writeFile(`${REPO_DIR}/${filepath}`, content, "utf8")
      }

      // Delete files that local side deleted
      for (const filepath of deletedFromRemote) {
        await fs.promises.unlink(`${REPO_DIR}/${filepath}`).catch(() => null)
      }

      // Stage all changes
      const filesToAdd = Object.keys(resolved)
      if (filesToAdd.length > 0) {
        await gitAdd(filesToAdd)
      }
      for (const filepath of deletedFromRemote) {
        try {
          await gitRemove(filepath)
        } catch {
          // Ignore if file isn't tracked
        }
      }

      // Commit the resolved changes
      await gitCommit("Resolve sync conflicts")
    }

    // Try pushing again
    try {
      await gitPush(user)

      // Read the final file state from the working directory to return to caller
      const finalFiles: Record<string, string> = {}
      const allPaths = new Set([...Object.keys(remoteFiles), ...Object.keys(resolved)])
      for (const filepath of deletedFromRemote) {
        allPaths.delete(filepath)
      }
      for (const filepath of allPaths) {
        try {
          const content = await fs.promises.readFile(`${REPO_DIR}/${filepath}`, "utf8")
          if (typeof content === "string") {
            finalFiles[filepath] = content
          }
        } catch {
          // File may have been deleted
        }
      }

      return { markdownFiles: finalFiles }
    } catch (retryError) {
      if (!isPushRejected(retryError) || attempt === MAX_REBASE_RETRIES) {
        throw retryError
      }
      // Push rejected again — loop will retry
    }
  }

  throw new Error("Push failed after maximum rebase retries")
}
