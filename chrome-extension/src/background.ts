import LightningFS from "@isomorphic-git/lightning-fs"
import git from "isomorphic-git"
import http from "isomorphic-git/http/web"
import type { Message, NoteInfo, Settings, UrlIndex } from "./types"

// ---------------------------------------------------------------------------
// File system & git setup
// ---------------------------------------------------------------------------

const DB_NAME = "lumen-ext-fs"
const REPO_DIR = "/repo"
const DEFAULT_BRANCH = "main"

let fs: LightningFS | null = null

function getFs(): LightningFS {
  if (!fs) {
    fs = new LightningFS(DB_NAME)
  }
  return fs
}

// ---------------------------------------------------------------------------
// Settings helpers
// ---------------------------------------------------------------------------

async function getSettings(): Promise<Settings | null> {
  const result = await chrome.storage.local.get("settings")
  return result.settings ?? null
}

async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ settings })
}

// ---------------------------------------------------------------------------
// URL index helpers (maps URL → noteId for fast lookup)
// ---------------------------------------------------------------------------

async function getUrlIndex(): Promise<UrlIndex> {
  const result = await chrome.storage.local.get("urlIndex")
  return result.urlIndex ?? {}
}

async function saveUrlIndex(index: UrlIndex): Promise<void> {
  await chrome.storage.local.set({ urlIndex: index })
}

// ---------------------------------------------------------------------------
// Highlight state (per-tab toggle)
// ---------------------------------------------------------------------------

/** Tracks which URLs have highlighting enabled */
const highlightStates = new Map<string, boolean>()

// ---------------------------------------------------------------------------
// Git operations
// ---------------------------------------------------------------------------

function authFor(settings: Settings) {
  return () => ({ username: settings.githubLogin, password: settings.githubToken })
}

async function isRepoCloned(): Promise<boolean> {
  try {
    const lfs = getFs()
    const files = await lfs.promises.readdir(REPO_DIR)
    return files.length > 0
  } catch {
    return false
  }
}

async function cloneRepo(settings: Settings): Promise<void> {
  const lfs = getFs()

  // Wipe and recreate
  try {
    indexedDB.deleteDatabase(DB_NAME)
    fs = null
  } catch {
    // ignore
  }

  const freshFs = getFs()

  await git.clone({
    fs: freshFs,
    http,
    dir: REPO_DIR,
    url: `https://github.com/${settings.repoOwner}/${settings.repoName}`,
    ref: DEFAULT_BRANCH,
    singleBranch: true,
    depth: 1,
    onAuth: authFor(settings),
  })

  // Set user config
  await git.setConfig({
    fs: freshFs,
    dir: REPO_DIR,
    path: "user.name",
    value: settings.githubName,
  })
  await git.setConfig({
    fs: freshFs,
    dir: REPO_DIR,
    path: "user.email",
    value: settings.githubEmail,
  })

  // Build URL index from all markdown files
  await rebuildUrlIndex()
}

async function pullRepo(settings: Settings): Promise<void> {
  await git.pull({
    fs: getFs(),
    http,
    dir: REPO_DIR,
    singleBranch: true,
    onAuth: authFor(settings),
  })
}

async function pushRepo(settings: Settings): Promise<void> {
  await git.push({
    fs: getFs(),
    http,
    dir: REPO_DIR,
    onAuth: authFor(settings),
  })
}

async function commitAndPush(settings: Settings, filePaths: string[], message: string) {
  const lfs = getFs()

  await git.add({ fs: lfs, dir: REPO_DIR, filepath: filePaths })
  await git.commit({ fs: lfs, dir: REPO_DIR, message })

  // Push in the background — don't block the caller
  pushRepo(settings).catch((err) => {
    console.error("Push failed (will retry on next sync):", err)
  })
}

// ---------------------------------------------------------------------------
// URL index management
// ---------------------------------------------------------------------------

/** Parses the `url` field from YAML frontmatter without a YAML library */
function extractUrlFromFrontmatter(content: string): string | null {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/)
  if (!fmMatch) return null

  const frontmatter = fmMatch[1]
  // Match url: "value" or url: 'value' or url: value
  const urlMatch = frontmatter.match(/^url:\s*["']?(.+?)["']?\s*$/m)
  return urlMatch ? urlMatch[1] : null
}

/** Extract the title (first H1 heading) from markdown content */
function extractTitle(content: string): string {
  // Strip frontmatter first
  const withoutFm = content.replace(/^---\n[\s\S]*?\n---\n*/, "")
  const titleMatch = withoutFm.match(/^#\s+(.+)$/m)
  return titleMatch ? titleMatch[1].trim() : ""
}

/** Walk all .md files and build the URL → noteId index */
async function rebuildUrlIndex(): Promise<UrlIndex> {
  const lfs = getFs()
  const index: UrlIndex = {}

  try {
    const files = await git.walk({
      fs: lfs,
      dir: REPO_DIR,
      trees: [git.WORKDIR()],
      map: async (filepath, [entry]) => {
        if (!filepath.endsWith(".md")) return undefined
        if (!entry) return undefined

        try {
          const contentBuf = await entry.content()
          if (!contentBuf) return undefined
          const content = new TextDecoder().decode(contentBuf)
          const url = extractUrlFromFrontmatter(content)
          if (url) {
            const noteId = filepath.replace(/\.md$/, "")
            return [url, noteId]
          }
        } catch {
          // Skip files we can't read
        }
        return undefined
      },
    })

    for (const entry of files) {
      if (entry && Array.isArray(entry)) {
        const [url, noteId] = entry as [string, string]
        index[url] = noteId
      }
    }
  } catch (err) {
    console.error("Error building URL index:", err)
  }

  await saveUrlIndex(index)
  return index
}

// ---------------------------------------------------------------------------
// Note operations
// ---------------------------------------------------------------------------

function generateNoteId(): string {
  return Date.now().toString()
}

function buildNoteContent(title: string, url: string): string {
  return `---\nurl: "${url}"\nupdated_at: ${new Date().toISOString()}\n---\n\n# ${title}\n\n## Highlights\n`
}

async function createNote(
  settings: Settings,
  url: string,
  title: string,
): Promise<NoteInfo> {
  const lfs = getFs()
  const noteId = generateNoteId()
  const filePath = `${noteId}.md`
  const content = buildNoteContent(title, url)

  await lfs.promises.writeFile(`${REPO_DIR}/${filePath}`, content, "utf8")

  // Update URL index
  const index = await getUrlIndex()
  index[url] = noteId
  await saveUrlIndex(index)

  // Commit and push
  await commitAndPush(settings, [filePath], `Add highlight note: ${title}`)

  return {
    noteId,
    title,
    url,
    lumenUrl: buildLumenUrl(settings, noteId),
  }
}

async function addHighlight(settings: Settings, url: string, text: string): Promise<NoteInfo> {
  const lfs = getFs()
  const index = await getUrlIndex()
  const noteId = index[url]

  if (!noteId) {
    throw new Error("No note found for this URL")
  }

  const filePath = `${noteId}.md`
  const fullPath = `${REPO_DIR}/${filePath}`

  let content = (await lfs.promises.readFile(fullPath, "utf8")) as string

  // Update the updated_at timestamp
  const fmMatch = content.match(/^(---\n)([\s\S]*?)(\n---)/)
  if (fmMatch) {
    const fmContent = fmMatch[2]
    const updatedFm = fmContent.replace(
      /^updated_at:.*$/m,
      `updated_at: ${new Date().toISOString()}`,
    )
    content = `${fmMatch[1]}${updatedFm}${fmMatch[3]}${content.slice(fmMatch[0].length)}`
  }

  // Format the highlight as a blockquote
  const blockquote = text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n")

  // Find the "## Highlights" section and append after it
  const highlightsIndex = content.indexOf("## Highlights")
  if (highlightsIndex !== -1) {
    // Find the end of the "## Highlights" line
    const lineEnd = content.indexOf("\n", highlightsIndex)
    const insertPos = lineEnd !== -1 ? lineEnd : content.length

    // Find where the next section starts (or end of file) to append there
    const afterHighlights = content.slice(insertPos)
    const nextSectionMatch = afterHighlights.match(/\n## [^#]/)
    const insertAt = nextSectionMatch
      ? insertPos + (nextSectionMatch.index ?? afterHighlights.length)
      : content.length

    const before = content.slice(0, insertAt)
    const after = content.slice(insertAt)

    content = `${before}\n\n${blockquote}\n${after}`
  } else {
    // No highlights section — append one
    content = `${content.trimEnd()}\n\n## Highlights\n\n${blockquote}\n`
  }

  await lfs.promises.writeFile(fullPath, content, "utf8")

  // Commit and push
  await commitAndPush(settings, [filePath], `Add highlight to ${noteId}`)

  const title = extractTitle(content)

  return {
    noteId,
    title,
    url,
    lumenUrl: buildLumenUrl(settings, noteId),
  }
}

function buildLumenUrl(settings: Settings, noteId: string): string {
  const base = settings.lumenBaseUrl.replace(/\/$/, "")
  return `${base}/notes/${noteId}`
}

// ---------------------------------------------------------------------------
// Lookup a URL in the index
// ---------------------------------------------------------------------------

async function lookupUrl(settings: Settings, url: string): Promise<NoteInfo | null> {
  const index = await getUrlIndex()
  const noteId = index[url]
  if (!noteId) return null

  // Read the note to get its title
  const lfs = getFs()
  try {
    const content = (await lfs.promises.readFile(`${REPO_DIR}/${noteId}.md`, "utf8")) as string
    const title = extractTitle(content)

    return {
      noteId,
      title,
      url,
      lumenUrl: buildLumenUrl(settings, noteId),
    }
  } catch {
    // Note file might have been deleted — remove from index
    delete index[url]
    await saveUrlIndex(index)
    return null
  }
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener(
  (message: Message, _sender, sendResponse: (response: Message) => void) => {
    handleMessage(message)
      .then(sendResponse)
      .catch((err) => {
        console.error("Message handler error:", err)
        sendResponse({ type: "ERROR", error: String(err) })
      })
    // Return true to indicate we'll call sendResponse asynchronously
    return true
  },
)

async function handleMessage(message: Message): Promise<Message> {
  const settings = await getSettings()

  switch (message.type) {
    case "GET_SETTINGS": {
      const cloned = await isRepoCloned()
      return { type: "SETTINGS_RESULT", settings, isRepoCloned: cloned }
    }

    case "SAVE_SETTINGS": {
      try {
        await saveSettings(message.settings)
        // Clone the repo with new settings
        await cloneRepo(message.settings)
        return { type: "SETTINGS_SAVED", success: true }
      } catch (err) {
        return { type: "SETTINGS_SAVED", success: false, error: String(err) }
      }
    }

    case "CHECK_URL": {
      if (!settings) {
        return { type: "URL_STATUS", exists: false }
      }
      const note = await lookupUrl(settings, normalizeUrl(message.url))
      return { type: "URL_STATUS", exists: !!note, note: note ?? undefined }
    }

    case "CREATE_NOTE": {
      if (!settings) {
        return { type: "ERROR", error: "Not configured" }
      }
      const note = await createNote(settings, normalizeUrl(message.url), message.title)
      // Auto-enable highlighting for the newly created note
      highlightStates.set(normalizeUrl(message.url), true)
      return { type: "NOTE_CREATED", note }
    }

    case "ADD_HIGHLIGHT": {
      if (!settings) {
        return { type: "ERROR", error: "Not configured" }
      }
      const note = await addHighlight(settings, normalizeUrl(message.url), message.text)
      return { type: "HIGHLIGHT_ADDED" }
    }

    case "GET_HIGHLIGHT_STATE": {
      const enabled = highlightStates.get(normalizeUrl(message.url)) ?? false
      return { type: "HIGHLIGHT_STATE", enabled }
    }

    case "SET_HIGHLIGHT_STATE": {
      highlightStates.set(normalizeUrl(message.url), message.enabled)
      return { type: "HIGHLIGHT_STATE", enabled: message.enabled }
    }

    case "SYNC": {
      if (!settings) {
        return { type: "SYNC_RESULT", success: false, error: "Not configured" }
      }
      try {
        await pullRepo(settings)
        await rebuildUrlIndex()
        return { type: "SYNC_RESULT", success: true }
      } catch (err) {
        return { type: "SYNC_RESULT", success: false, error: String(err) }
      }
    }

    default:
      return { type: "ERROR", error: `Unknown message type: ${(message as Message).type}` }
  }
}

// ---------------------------------------------------------------------------
// URL normalization — strip fragments so the same page matches
// ---------------------------------------------------------------------------

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url)
    parsed.hash = ""
    return parsed.toString()
  } catch {
    return url
  }
}
