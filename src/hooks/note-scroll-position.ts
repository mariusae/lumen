import { EditorSelection } from "@codemirror/state"
import { ReactCodeMirrorRef } from "@uiw/react-codemirror"
import React from "react"
import { NoteId } from "../schema"
import { getNoteScrollPosition, saveNoteScrollPosition } from "../utils/note-scroll-position"

/**
 * Saves and restores scroll position and editor selection for a note.
 *
 * Expects the parent component to use `key={noteId}` so that the hook
 * remounts (and thus saves/restores) whenever the note changes.
 */
export function useNoteScrollPosition(
  noteId: NoteId | undefined,
  scrollContainer: HTMLElement | null,
  editorRef: React.RefObject<ReactCodeMirrorRef | null>,
): void {
  // Read saved state on mount (stable because parent uses key={noteId})
  const savedState = React.useMemo(() => (noteId ? getNoteScrollPosition(noteId) : null), [noteId])

  // Track latest scroll position via ref to avoid re-renders
  const scrollTopRef = React.useRef(0)

  // Save state on unmount
  React.useEffect(() => {
    const id = noteId
    return () => {
      if (!id) return
      const selection = editorRef.current?.view?.state.selection.main
      saveNoteScrollPosition(id, {
        scrollTop: scrollTopRef.current,
        selectionAnchor: selection?.anchor ?? 0,
        selectionHead: selection?.head ?? 0,
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

  // Restore editor selection after the editor has settled.
  // We use requestAnimationFrame to ensure the editor has finished
  // syncing its value prop before we set the selection.
  // Note: We must NOT use EditorView.scrollIntoView here because it walks
  // up the DOM tree and scrolls the page layout container, overriding the
  // scroll restoration above. The scroll container restoration handles scrolling.
  const selectionRestoredRef = React.useRef(false)
  React.useEffect(() => {
    if (!savedState || selectionRestoredRef.current) return

    const view = editorRef.current?.view
    if (!view) return

    requestAnimationFrame(() => {
      if (selectionRestoredRef.current) return

      const docLength = view.state.doc.length
      if (docLength === 0) return

      selectionRestoredRef.current = true

      const anchor = Math.min(savedState.selectionAnchor, docLength)
      const head = Math.min(savedState.selectionHead, docLength)
      view.dispatch({
        selection: EditorSelection.range(anchor, head),
      })
    })
  })
}
