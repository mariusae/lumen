import { DEFAULT_BRANCH } from "./git"

const DEFAULT_INTERVAL_MS = 30_000
const MAX_BACKOFF_MS = 300_000 // 5 minutes

type RemoteSyncPollerOptions = {
  owner: string
  name: string
  token: string
  onRemoteChange: () => void
  intervalMs?: number
}

/**
 * Polls the GitHub REST API to detect remote pushes.
 *
 * Uses ETag-based conditional requests so that 304 Not Modified responses
 * do not count against the GitHub API rate limit.
 */
export class RemoteSyncPoller {
  private intervalId: ReturnType<typeof setInterval> | null = null
  private lastETag: string | null = null
  private lastKnownSha: string | null = null
  private paused = false
  private backoffMs = 0
  private options: RemoteSyncPollerOptions | null = null

  start(options: RemoteSyncPollerOptions) {
    this.stop()
    this.options = options
    this.paused = false
    this.backoffMs = 0

    const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS

    // Do an initial poll to seed the ETag and SHA
    this.poll()

    this.intervalId = setInterval(() => this.poll(), intervalMs)
  }

  stop() {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    this.options = null
    this.lastETag = null
    this.lastKnownSha = null
    this.paused = false
    this.backoffMs = 0
  }

  pause() {
    this.paused = true
  }

  resume() {
    this.paused = false
  }

  /** Update the last known SHA after a local push to avoid false triggers. */
  updateLastKnownSha(sha: string) {
    this.lastKnownSha = sha
  }

  private async poll() {
    if (this.paused || !this.options || !navigator.onLine) return

    // Respect backoff
    if (this.backoffMs > 0) {
      this.backoffMs = Math.max(
        0,
        this.backoffMs - (this.options.intervalMs ?? DEFAULT_INTERVAL_MS),
      )
      return
    }

    const { owner, name, token, onRemoteChange } = this.options

    const headers: Record<string, string> = {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github.v3+json",
    }

    if (this.lastETag) {
      headers["If-None-Match"] = this.lastETag
    }

    try {
      const response = await fetch(
        `https://api.github.com/repos/${owner}/${name}/git/refs/heads/${DEFAULT_BRANCH}`,
        { headers },
      )

      if (response.status === 304) {
        // No change — free against rate limit
        this.backoffMs = 0
        return
      }

      if (response.status === 401 || response.status === 403) {
        // Token expired or rate-limited — back off significantly
        console.warn("[RemoteSyncPoller] Auth or rate limit error, backing off")
        this.backoffMs = MAX_BACKOFF_MS
        return
      }

      if (!response.ok) {
        throw new Error(`GitHub API returned ${response.status}`)
      }

      // Store the new ETag
      const etag = response.headers.get("etag")
      if (etag) {
        this.lastETag = etag
      }

      const data = (await response.json()) as { object?: { sha?: string } }
      const remoteSha = data.object?.sha

      if (!remoteSha) return

      if (this.lastKnownSha === null) {
        // First poll — just seed the SHA, don't trigger a sync
        this.lastKnownSha = remoteSha
        return
      }

      if (remoteSha !== this.lastKnownSha) {
        console.debug("[RemoteSyncPoller] Remote change detected", {
          previous: this.lastKnownSha,
          current: remoteSha,
        })
        this.lastKnownSha = remoteSha
        onRemoteChange()
      }

      // Successful response — reset backoff
      this.backoffMs = 0
    } catch (error) {
      console.warn("[RemoteSyncPoller] Poll failed, backing off", error)
      // Exponential backoff: double each failure, capped at MAX_BACKOFF_MS
      const baseInterval = this.options.intervalMs ?? DEFAULT_INTERVAL_MS
      this.backoffMs = Math.min(
        MAX_BACKOFF_MS,
        this.backoffMs === 0 ? baseInterval : this.backoffMs * 2,
      )
    }
  }
}
