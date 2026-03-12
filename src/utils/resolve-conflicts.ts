import { parseFrontmatter } from "./frontmatter"

/**
 * Extract the `updated_at` timestamp (in ms) from a markdown file's frontmatter.
 * Returns null if not present or unparseable.
 */
export function getUpdatedAt(content: string): number | null {
  const { frontmatter } = parseFrontmatter(content)
  const raw = frontmatter.updated_at
  if (raw instanceof Date) return raw.getTime()
  if (typeof raw === "string") {
    const parsed = Date.parse(raw)
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

/**
 * Given two sets of files (local HEAD vs remote HEAD) and their commit timestamps,
 * resolve conflicts and return the set of files that should exist after the rebase.
 *
 * The returned `resolved` map contains every file that should be present in the
 * final commit on top of remote HEAD. Files that are identical to the remote version
 * are omitted (they're already there).
 *
 * `deletedFromRemote` lists filepaths that exist in remote HEAD but should be
 * removed (because the local side deleted them and the local commit is newer).
 */
export function resolveConflicts(
  localFiles: Record<string, string>,
  remoteFiles: Record<string, string>,
  localCommitTs: number,
  remoteCommitTs: number,
): {
  resolved: Record<string, string>
  deletedFromRemote: string[]
} {
  const resolved: Record<string, string> = {}
  const deletedFromRemote: string[] = []

  const allPaths = new Set([...Object.keys(localFiles), ...Object.keys(remoteFiles)])

  for (const filepath of allPaths) {
    const inLocal = filepath in localFiles
    const inRemote = filepath in remoteFiles

    if (inLocal && inRemote) {
      // Both sides have the file
      if (localFiles[filepath] === remoteFiles[filepath]) {
        // Identical content — no action needed (already at remote HEAD)
        continue
      }

      // Conflict: different content — pick by updated_at, fallback to commit timestamp
      const winner = pickWinner(
        localFiles[filepath],
        remoteFiles[filepath],
        localCommitTs,
        remoteCommitTs,
      )

      if (winner === "local") {
        resolved[filepath] = localFiles[filepath]
      }
      // If remote wins, file is already at remote HEAD — no action needed
    } else if (inLocal && !inRemote) {
      // File only exists locally — could be a new local file, or remote deleted it
      // Keep the local file (local addition wins, or local is newer than the delete)
      resolved[filepath] = localFiles[filepath]
    } else if (!inLocal && inRemote) {
      // File only exists on remote — could be a new remote file, or local deleted it
      // Decide based on commit timestamps: if local commit is newer, respect the deletion
      if (localCommitTs > remoteCommitTs) {
        deletedFromRemote.push(filepath)
      }
      // If remote commit is newer (or equal), keep the remote file (no action needed)
    }
  }

  return { resolved, deletedFromRemote }
}

/**
 * Given two conflicting versions of the same file and their commit timestamps,
 * decide which version wins.
 */
function pickWinner(
  localContent: string,
  remoteContent: string,
  localCommitTs: number,
  remoteCommitTs: number,
): "local" | "remote" {
  const localUpdatedAt = getUpdatedAt(localContent)
  const remoteUpdatedAt = getUpdatedAt(remoteContent)

  if (localUpdatedAt !== null && remoteUpdatedAt !== null) {
    // Both have updated_at — pick the later one
    return localUpdatedAt >= remoteUpdatedAt ? "local" : "remote"
  }

  if (localUpdatedAt !== null && remoteUpdatedAt === null) {
    // Only local has updated_at — it was explicitly edited
    return "local"
  }

  if (localUpdatedAt === null && remoteUpdatedAt !== null) {
    // Only remote has updated_at
    return "remote"
  }

  // Neither has updated_at — fall back to commit timestamps
  return localCommitTs >= remoteCommitTs ? "local" : "remote"
}
