import { EditorSelection, Transaction } from "@codemirror/state"
import { ViewUpdate } from "@codemirror/view"
import React from "react"
import { NoteId } from "../schema"
import { getNoteScrollPosition, saveNoteScrollPosition } from "../utils/note-scroll-position"

export type InitialSelection = {
  anchor: number
  head: number
}

/**
 * Saves and restores scroll position and editor selection for a note.
 *
 * Expects the parent component to use `key={noteId}` so that the hook
 * remounts (and thus saves/restores) whenever the note changes.
 *
 * Returns `initialSelection` to pass to NoteEditor and `onEditorUpdate`
 * to pass as `onStateChange` so the hook can track the current selection.
 */
export function useNoteScrollPosition(
  noteId: NoteId | undefined,
  scrollContainer: HTMLElement | null,
): {
  initialSelection: InitialSelection | undefined
  onEditorUpdate: (update: ViewUpdate) => void
} {
  // Read saved state on mount (stable because parent uses key={noteId})
  const savedState = React.useMemo(() => (noteId ? getNoteScrollPosition(noteId) : null), [noteId])

  // Track latest scroll position via ref to avoid re-renders
  const scrollTopRef = React.useRef(0)

  // Track latest editor selection via ref, updated by onEditorUpdate callback.
  // We can't read from editorRef during unmount because useImperativeHandle
  // clears the ref (layout cleanup) before our useEffect cleanup runs.
  const selectionRef = React.useRef({ anchor: 0, head: 0 })

  const onEditorUpdate = React.useCallback((update: ViewUpdate) => {
    if (update.docChanged) {
      // Detect external (non-user) document changes, e.g. when saveNote adds
      // an updated_at timestamp and CodeMirror's value reconciliation does a
      // full document replace. Such replaces map the cursor to the end.
      // Restore the previous selection position instead.
      const isExternalChange = update.transactions.some(
        (tr) => tr.docChanged && !tr.annotation(Transaction.userEvent),
      )
      if (isExternalChange) {
        const docLength = update.state.doc.length
        const anchor = Math.min(selectionRef.current.anchor, docLength)
        const head = Math.min(selectionRef.current.head, docLength)
        setTimeout(() => {
          update.view.dispatch({
            selection: EditorSelection.range(anchor, head),
          })
        }, 0)
        return
      }
    }

    const sel = update.state.selection.main
    selectionRef.current = { anchor: sel.anchor, head: sel.head }
  }, [])

  // Save state on unmount
  React.useEffect(() => {
    const id = noteId
    return () => {
      if (!id) return
      saveNoteScrollPosition(id, {
        scrollTop: scrollTopRef.current,
        selectionAnchor: selectionRef.current.anchor,
        selectionHead: selectionRef.current.head,
      })
    }
  }, [noteId])

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

  const initialSelection = React.useMemo(
    () =>
      savedState
        ? { anchor: savedState.selectionAnchor, head: savedState.selectionHead }
        : undefined,
    [savedState],
  )

  return { initialSelection, onEditorUpdate }
}
