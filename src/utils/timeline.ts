import git from "isomorphic-git"
import { fs } from "./fs"
import { REPO_DIR } from "./git"

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type CommitInfo = {
  oid: string
  timestamp: number
  files: string[]
}

export type DayGroup = {
  date: string // YYYY-MM-DD
  commits: CommitInfo[]
}

export type FileChange = {
  filepath: string
  title: string
  paragraphs: string[]
}

export type DayEntry = {
  date: string // YYYY-MM-DD
  files: FileChange[]
}

// -----------------------------------------------------------------------------
// Step 1: Get all commits with touched files
// -----------------------------------------------------------------------------

/** Cache for the full commit log */
let commitLogCache: CommitInfo[] | null = null

/** Get all commits with their touched markdown files, in reverse-chronological order. */
export async function getCommitLog(): Promise<CommitInfo[]> {
  if (commitLogCache) return commitLogCache

  const commits = await git.log({
    fs,
    dir: REPO_DIR,
    ref: "HEAD",
  })

  const result: CommitInfo[] = []

  for (const commit of commits) {
    const parentOid = commit.commit.parent[0] ?? null

    // Skip commits at the shallow clone boundary (parent not available locally).
    // We can't compute a meaningful diff without the parent tree.
    if (parentOid) {
      try {
        await git.readCommit({ fs, dir: REPO_DIR, oid: parentOid })
      } catch {
        continue
      }
    } else {
      // Initial commit (no parent at all) — skip, as showing all files isn't useful
      continue
    }

    // Get files changed in this commit by comparing trees
    const files = await getChangedFiles(commit.oid, parentOid)
    const mdFiles = files.filter(
      (f) => f.endsWith(".md") && !f.startsWith(".") && !f.includes("/."),
    )

    if (mdFiles.length === 0) continue

    result.push({
      oid: commit.oid,
      timestamp: commit.commit.committer.timestamp,
      files: mdFiles,
    })
  }

  commitLogCache = result
  return result
}

/** Invalidate the commit log cache (call after sync) */
export function invalidateCommitLogCache() {
  commitLogCache = null
}

/** Get files changed between a commit and its parent */
async function getChangedFiles(oid: string, parentOid: string | null): Promise<string[]> {
  const tree = await readTreeRecursive(oid)
  const parentTree = parentOid ? await readTreeRecursive(parentOid) : new Map<string, string>()

  const changed: string[] = []
  for (const [path, blobOid] of tree) {
    if (parentTree.get(path) !== blobOid) {
      changed.push(path)
    }
  }

  return changed
}

/** Recursively read all files in a commit's tree, returning Map<filepath, blobOid> */
async function readTreeRecursive(commitOid: string): Promise<Map<string, string>> {
  const result = new Map<string, string>()

  const { commit } = await git.readCommit({
    fs,
    dir: REPO_DIR,
    oid: commitOid,
  })

  async function walkTree(treeOid: string, prefix: string) {
    const { tree } = await git.readTree({
      fs,
      dir: REPO_DIR,
      oid: treeOid,
    })

    for (const entry of tree) {
      const fullPath = prefix ? `${prefix}/${entry.path}` : entry.path

      if (entry.type === "blob") {
        result.set(fullPath, entry.oid)
      } else if (entry.type === "tree") {
        await walkTree(entry.oid, fullPath)
      }
    }
  }

  await walkTree(commit.tree, "")
  return result
}

// -----------------------------------------------------------------------------
// Step 2: Group commits by calendar day
// -----------------------------------------------------------------------------

/** Group commits by their local calendar date (YYYY-MM-DD) */
export function groupCommitsByDay(commits: CommitInfo[]): DayGroup[] {
  const groups = new Map<string, CommitInfo[]>()

  for (const commit of commits) {
    const date = new Date(commit.timestamp * 1000)
    const dateStr = formatDateKey(date)

    const existing = groups.get(dateStr)
    if (existing) {
      existing.push(commit)
    } else {
      groups.set(dateStr, [commit])
    }
  }

  // Sort each day's commits by timestamp descending (newest first)
  for (const dayCommits of groups.values()) {
    dayCommits.sort((a, b) => b.timestamp - a.timestamp)
  }

  // Sort days by date descending (most recent day first)
  return Array.from(groups.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, commits]) => ({
      date,
      commits,
    }))
}

function formatDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

// -----------------------------------------------------------------------------
// Step 3: Compute paragraph-level diffs for a day
// -----------------------------------------------------------------------------

/** Read a file's content at a specific commit OID. Returns empty string if not found. */
async function readFileAtCommit(commitOid: string, filepath: string): Promise<string> {
  try {
    const { blob } = await git.readBlob({
      fs,
      dir: REPO_DIR,
      oid: commitOid,
      filepath,
    })
    return new TextDecoder().decode(blob)
  } catch {
    return ""
  }
}

/** Strip YAML frontmatter from markdown content */
function stripFrontmatter(content: string): string {
  if (!content.startsWith("---")) return content
  const endIndex = content.indexOf("\n---", 3)
  if (endIndex === -1) return content
  return content.slice(endIndex + 4).trim()
}

/** Split content into paragraphs (consecutive non-blank lines) */
function splitParagraphs(content: string): string[] {
  if (!content) return []
  return content
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
}

/** Extract note title from content */
function extractTitle(content: string): string {
  const stripped = stripFrontmatter(content)
  const match = stripped.match(/^#\s+(.+)/m)
  return match ? match[1].trim() : ""
}

/** Compute paragraph-level changes for a single day */
export async function computeDayChanges(day: DayGroup): Promise<DayEntry> {
  const { date, commits } = day

  // Collect all unique files touched this day, in order of most recent touch
  const seenFiles = new Set<string>()
  const orderedFiles: string[] = []
  for (const commit of commits) {
    for (const file of commit.files) {
      if (!seenFiles.has(file)) {
        seenFiles.add(file)
        orderedFiles.push(file)
      }
    }
  }

  const newestOid = commits[0].oid
  const oldestOid = commits[commits.length - 1].oid

  // Get the parent of the oldest commit for "before" state
  let beforeOid: string | null = null
  try {
    const { commit } = await git.readCommit({
      fs,
      dir: REPO_DIR,
      oid: oldestOid,
    })
    if (commit.parent.length > 0) {
      // Verify the parent is actually readable (not a shallow boundary)
      await git.readCommit({ fs, dir: REPO_DIR, oid: commit.parent[0] })
      beforeOid = commit.parent[0]
    }
  } catch {
    // No parent or parent not available (initial commit / shallow boundary)
  }

  const fileChanges: FileChange[] = []

  for (const filepath of orderedFiles) {
    const afterContent = await readFileAtCommit(newestOid, filepath)
    const beforeContent = beforeOid ? await readFileAtCommit(beforeOid, filepath) : ""

    const afterStripped = stripFrontmatter(afterContent)
    const beforeStripped = stripFrontmatter(beforeContent)

    const afterParagraphs = splitParagraphs(afterStripped)
    const beforeParagraphSet = new Set(splitParagraphs(beforeStripped))

    // New or changed paragraphs: in "after" but not in "before"
    const changedParagraphs = afterParagraphs.filter((p) => !beforeParagraphSet.has(p))

    if (changedParagraphs.length === 0) continue

    // Extract title from the latest version, falling back to filename
    const title = extractTitle(afterContent) || filepath.replace(/\.md$/, "")

    fileChanges.push({
      filepath,
      title,
      paragraphs: changedParagraphs,
    })
  }

  return { date, files: fileChanges }
}
