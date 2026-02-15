import { EditorView } from "@codemirror/view"
import { useAttachFile } from "../hooks/attach-file"
import { isValidUnixTimestamp } from "../utils/date"

export function pasteExtension({
  attachFile,
  onPaste,
}: {
  attachFile: ReturnType<typeof useAttachFile>
  onPaste?: (event: ClipboardEvent, view: EditorView) => void
}) {
  return EditorView.domEventHandlers({
    paste: (event, view) => {
      const clipboardText = event.clipboardData?.getData("text/plain") ?? ""

      // If the clipboard text is a URL or a Unix timestamp (likely a note ID),
      // make the selected text a link to that URL or note
      const isUrl = /^https?:\/\/\S+$/.test(clipboardText.trim())
      const isUnixTimestamp = isValidUnixTimestamp(clipboardText)

      if (isUrl || isUnixTimestamp) {
        // Get the selected text
        const { selection } = view.state
        const { from = 0, to = 0 } = selection.ranges[selection.mainIndex] ?? {}
        const selectedText = view?.state.doc.sliceString(from, to) ?? ""

        if (selectedText) {
          const markdown = isUnixTimestamp
            ? `[[${clipboardText}|${selectedText}]]`
            : `[${selectedText}](${clipboardText})`

          view.dispatch({
            changes: {
              from,
              to,
              insert: markdown,
            },
            selection: {
              anchor: from + markdown.length,
            },
          })

          event.preventDefault()
        } else if (isUrl) {
          // No text selected, paste only a URL: fetch the title and format as [title](url)
          const url = clipboardText.trim()
          const placeholder = `[${url}](${url})`

          view.dispatch({
            changes: {
              from,
              to,
              insert: placeholder,
            },
            selection: {
              anchor: from + placeholder.length,
            },
          })

          event.preventDefault()

          fetchLinkTitle(url).then((title) => {
            if (!title) return

            // Find the placeholder in the document and replace it
            const doc = view.state.doc.toString()
            const placeholderIndex = doc.indexOf(placeholder)
            if (placeholderIndex === -1) return

            const replacement = `[${title}](${url})`
            view.dispatch({
              changes: {
                from: placeholderIndex,
                to: placeholderIndex + placeholder.length,
                insert: replacement,
              },
            })
          })
        }
      }

      // If the clipboard contains a file, upload it
      const [file] = Array.from(event.clipboardData?.files ?? [])

      if (file) {
        attachFile(file, view)
        event.preventDefault()
      }

      onPaste?.(event, view)
    },
  })
}

async function fetchLinkTitle(url: string): Promise<string | null> {
  try {
    const response = await fetch(`/link-metadata?url=${encodeURIComponent(url)}`)
    if (!response.ok) return null
    const data = await response.json()
    return data.title || null
  } catch {
    return null
  }
}
