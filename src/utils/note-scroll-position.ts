import { NoteId } from "../schema"

const STORAGE_KEY_PREFIX = "note-scroll:"

type NoteScrollState = {
  scrollTop: number
  selectionAnchor: number
  selectionHead: number
}

export function getNoteScrollPosition(noteId: NoteId): NoteScrollState | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${noteId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return {
      scrollTop: typeof parsed.scrollTop === "number" ? parsed.scrollTop : 0,
      selectionAnchor: typeof parsed.selectionAnchor === "number" ? parsed.selectionAnchor : 0,
      selectionHead:
        typeof parsed.selectionHead === "number"
          ? parsed.selectionHead
          : typeof parsed.cursorPosition === "number"
            ? parsed.cursorPosition
            : 0,
    }
  } catch {
    return null
  }
}

export function saveNoteScrollPosition(noteId: NoteId, state: NoteScrollState): void {
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${noteId}`, JSON.stringify(state))
  } catch {
    // Ignore storage errors (e.g., private mode restrictions)
  }
}
