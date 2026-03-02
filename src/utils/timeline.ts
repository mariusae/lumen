import { GitHubRepository, GitHubUser } from "../schema"

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type CommitInfo = {
  oid: string
  timestamp: number
  parentOid: string | null
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

type TimelineContext = {
  token: string
  owner: string
  repo: string
}

// -----------------------------------------------------------------------------
// GitHub API helpers
// -----------------------------------------------------------------------------

async function githubApi(ctx: TimelineContext, path: string): Promise<Response> {
  const res = await fetch(`https://api.github.com/repos/${ctx.owner}/${ctx.repo}${path}`, {
    headers: {
      Authorization: `token ${ctx.token}`,
      Accept: "application/vnd.github.v3+json",
    },
  })
  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${res.statusText}`)
  }
  return res
}

// -----------------------------------------------------------------------------
// Step 1: Get all commits with touched files
// -----------------------------------------------------------------------------

let commitLogCache: CommitInfo[] | null = null

/** Fetch all commits from GitHub API, paginating through results. */
export async function getCommitLog(ctx: TimelineContext): Promise<CommitInfo[]> {
  if (commitLogCache) return commitLogCache

  const allCommits: CommitInfo[] = []
  let page = 1

  while (true) {
    const res = await githubApi(ctx, `/commits?per_page=100&page=${page}`)
    const commits = await res.json()

    if (!Array.isArray(commits) || commits.length === 0) break

    for (const commit of commits as Array<{
      sha: string
      commit: { committer: { date: string } }
      parents: Array<{ sha: string }>
    }>) {
      const sha = commit.sha
      const timestamp = Math.floor(new Date(commit.commit.committer.date).getTime() / 1000)
      const parentOid = commit.parents?.[0]?.sha ?? null

      allCommits.push({
        oid: sha,
        timestamp,
        parentOid,
        files: [], // Files will be determined per-day via the compare API
      })
    }

    // Check for next page via Link header
    const linkHeader = res.headers.get("Link")
    if (!linkHeader || !linkHeader.includes('rel="next"')) break
    page++
  }

  commitLogCache = allCommits
  return allCommits
}

export function invalidateCommitLogCache() {
  commitLogCache = null
}

// -----------------------------------------------------------------------------
// Step 2: Group commits by calendar day
// -----------------------------------------------------------------------------

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

/** Read a file's content at a specific ref via GitHub API. Returns empty string if not found. */
async function readFileAtRef(ctx: TimelineContext, ref: string, filepath: string): Promise<string> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${ctx.owner}/${ctx.repo}/contents/${encodeURIComponent(filepath)}?ref=${ref}`,
      {
        headers: {
          Authorization: `token ${ctx.token}`,
          Accept: "application/vnd.github.v3.raw",
        },
      },
    )
    if (!res.ok) return ""
    return await res.text()
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

/** Compute paragraph-level changes for a single day using the GitHub compare API */
export async function computeDayChanges(ctx: TimelineContext, day: DayGroup): Promise<DayEntry> {
  const { date, commits } = day

  const newestOid = commits[0].oid
  const oldestOid = commits[commits.length - 1].oid
  const beforeOid = commits[commits.length - 1].parentOid

  // If there's no parent (initial commit), we'd show everything — skip instead
  if (!beforeOid) {
    return { date, files: [] }
  }

  // Use the compare API to find which files changed across the day
  let changedMdFiles: string[]
  try {
    const res = await githubApi(ctx, `/compare/${beforeOid}...${newestOid}`)
    const data = (await res.json()) as { files?: Array<{ filename: string }> }
    changedMdFiles = (data.files ?? [])
      .map((f: { filename: string }) => f.filename)
      .filter(
        (f: string) => f.endsWith(".md") && !f.startsWith(".") && !f.includes("/."),
      )
  } catch {
    return { date, files: [] }
  }

  if (changedMdFiles.length === 0) {
    return { date, files: [] }
  }

  const fileChanges: FileChange[] = []

  for (const filepath of changedMdFiles) {
    const afterContent = await readFileAtRef(ctx, newestOid, filepath)
    const beforeContent = await readFileAtRef(ctx, beforeOid, filepath)

    const afterStripped = stripFrontmatter(afterContent)
    const beforeStripped = stripFrontmatter(beforeContent)

    const afterParagraphs = splitParagraphs(afterStripped)
    const beforeParagraphSet = new Set(splitParagraphs(beforeStripped))

    // New or changed paragraphs: in "after" but not in "before"
    const changedParagraphs = afterParagraphs.filter((p) => !beforeParagraphSet.has(p))

    if (changedParagraphs.length === 0) continue

    const title = extractTitle(afterContent) || filepath.replace(/\.md$/, "")

    fileChanges.push({
      filepath,
      title,
      paragraphs: changedParagraphs,
    })
  }

  return { date, files: fileChanges }
}

/** Create a TimelineContext from app state */
export function createTimelineContext(
  user: GitHubUser,
  repo: GitHubRepository,
): TimelineContext {
  return {
    token: user.token,
    owner: repo.owner,
    repo: repo.name,
  }
}
