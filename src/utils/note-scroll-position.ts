import { NoteId } from "../schema"

const STORAGE_KEY_PREFIX = "note-scroll:"

type NoteScrollState = {
  scrollTop: number
  cursorPosition: number
}

export function getNoteScrollPosition(noteId: NoteId): NoteScrollState | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${noteId}`)
    if (!raw) return null
    return JSON.parse(raw)
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
