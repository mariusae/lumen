import { useAtomValue } from "jotai"
import { useCallback, useMemo, useState } from "react"
import { githubRepoAtom } from "../global-state"
import { Note, NoteId } from "../schema"
import { clearNoteDraft, getNoteDraft, setNoteDraft } from "../utils/note-draft"

export function useEditorValue({
  noteId,
  note,
  defaultValue,
}: {
  noteId: NoteId
  note: Note | undefined
  defaultValue: string
}) {
  const githubRepo = useAtomValue(githubRepoAtom)

  const [editorValue, _setEditorValue] = useState(() => {
    return getNoteDraft({ githubRepo, noteId }) ?? note?.content ?? defaultValue
  })

  // Track previous note content to detect external changes
  const [prevNoteContent, setPrevNoteContent] = useState(note?.content)

  // Adjust state during render when note content changes externally (no effect needed)
  // See: https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  if (note?.content !== prevNoteContent) {
    setPrevNoteContent(note?.content)
    // Only update editor if there's no local draft
    const hasDraft = getNoteDraft({ githubRepo, noteId }) !== null
    if (!hasDraft && note?.content !== undefined) {
      _setEditorValue(note.content)
    }
  }

  const isDraft = useMemo(() => {
    return editorValue !== (note ? note.content : defaultValue)
  }, [note, editorValue, defaultValue])

  const setEditorValue = useCallback(
    (value: string) => {
      _setEditorValue(value)

      if (note ? value !== note.content : value !== defaultValue) {
        setNoteDraft({ githubRepo, noteId, value })
      } else {
        clearNoteDraft({ githubRepo, noteId })
      }
    },
    [note, defaultValue, githubRepo, noteId],
  )

  const discardChanges = useCallback(() => {
    // Reset editor value to the last saved state of the note
    _setEditorValue(note?.content ?? defaultValue)
    clearNoteDraft({ githubRepo, noteId })
  }, [note, defaultValue, githubRepo, noteId])

  return { editorValue, setEditorValue, isDraft, discardChanges }
}
