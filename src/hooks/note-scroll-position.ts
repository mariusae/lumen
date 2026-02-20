import { ReactCodeMirrorRef } from "@uiw/react-codemirror"
import React from "react"
import { NoteId } from "../schema"
import { getNoteScrollPosition, saveNoteScrollPosition } from "../utils/note-scroll-position"

/**
 * Saves and restores scroll position and editor cursor position for a note.
 *
 * Expects the parent component to use `key={noteId}` so that the hook
 * remounts (and thus saves/restores) whenever the note changes.
 *
 * Returns the initial cursor position to pass to NoteEditor.
 */
export function useNoteScrollPosition(
  noteId: NoteId | undefined,
  scrollContainer: HTMLElement | null,
  editorRef: React.RefObject<ReactCodeMirrorRef | null>,
): number | undefined {
  // Read saved state on mount (stable because parent uses key={noteId})
  const savedState = React.useMemo(() => (noteId ? getNoteScrollPosition(noteId) : null), [noteId])

  // Track latest scroll position via ref to avoid re-renders
  const scrollTopRef = React.useRef(0)

  // Save state on unmount
  React.useEffect(() => {
    const id = noteId
    return () => {
      if (!id) return
      const cursorPosition = editorRef.current?.view?.state.selection.main.head ?? 0
      saveNoteScrollPosition(id, {
        scrollTop: scrollTopRef.current,
        cursorPosition,
      })
    }
  }, [noteId, editorRef])

  // Track scroll position
  React.useEffect(() => {
    if (!scrollContainer) return

    const handleScroll = () => {
      scrollTopRef.current = scrollContainer.scrollTop
    }

    scrollContainer.addEventListener("scroll", handleScroll, { passive: true })
    return () => scrollContainer.removeEventListener("scroll", handleScroll)
  }, [scrollContainer])

  // Restore scroll position when scroll container becomes available
  React.useEffect(() => {
    if (!scrollContainer || !savedState) return

    requestAnimationFrame(() => {
      scrollContainer.scrollTop = savedState.scrollTop
    })
  }, [scrollContainer, savedState])

  return savedState?.cursorPosition
}
