/** Settings stored in chrome.storage.local */
export interface Settings {
  githubToken: string
  githubLogin: string
  githubName: string
  githubEmail: string
  repoOwner: string
  repoName: string
  /** Base URL of the Lumen app instance (e.g., "https://lumen.town") */
  lumenBaseUrl: string
}

/** Index of URL → note ID, cached in chrome.storage.local */
export type UrlIndex = Record<string, string>

/** Info about a note associated with the current page */
export interface NoteInfo {
  noteId: string
  title: string
  url: string
  lumenUrl: string
}

// --- Chrome message types ---

export type Message =
  | { type: "CHECK_URL"; url: string }
  | { type: "URL_STATUS"; exists: boolean; note?: NoteInfo }
  | { type: "CREATE_NOTE"; url: string; title: string }
  | { type: "NOTE_CREATED"; note: NoteInfo }
  | { type: "ADD_HIGHLIGHT"; url: string; text: string }
  | { type: "HIGHLIGHT_ADDED" }
  | { type: "GET_SETTINGS" }
  | { type: "SETTINGS_RESULT"; settings: Settings | null; isRepoCloned: boolean }
  | { type: "SAVE_SETTINGS"; settings: Settings }
  | { type: "SETTINGS_SAVED"; success: boolean; error?: string }
  | { type: "SYNC" }
  | { type: "SYNC_RESULT"; success: boolean; error?: string }
  | { type: "GET_HIGHLIGHT_STATE"; url: string }
  | { type: "HIGHLIGHT_STATE"; enabled: boolean }
  | { type: "SET_HIGHLIGHT_STATE"; url: string; enabled: boolean }
  | { type: "ERROR"; error: string }
