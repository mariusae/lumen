import { EditorState, Extension, Range, StateField, Transaction } from "@codemirror/state"
import { Decoration, DecorationSet, EditorView } from "@codemirror/view"

const HIGHLIGHT_REGEX = /==((?:[^=]|=[^=])+?)==/g

const highlightMark = Decoration.mark({ class: "cm-highlight" })
const highlightMarkerMark = Decoration.mark({ class: "cm-highlight-marker" })

const highlightField = StateField.define({
  create(state) {
    return createDecorations(state)
  },
  update(decorations, transaction) {
    if (transaction.docChanged) {
      return createDecorations(transaction.state)
    }
    return decorations
  },
  provide: (f) => EditorView.decorations.from(f),
})

function createDecorations(state: EditorState) {
  const decorations: Range<Decoration>[] = []

  for (let i = 1; i <= state.doc.lines; i++) {
    const line = state.doc.line(i)
    const regex = new RegExp(HIGHLIGHT_REGEX.source, "g")
    let match

    while ((match = regex.exec(line.text)) !== null) {
      const from = line.from + match.index
      const contentStart = from + 2
      const contentEnd = contentStart + match[1].length
      const to = contentEnd + 2

      decorations.push(highlightMarkerMark.range(from, contentStart))
      decorations.push(highlightMark.range(contentStart, contentEnd))
      decorations.push(highlightMarkerMark.range(contentEnd, to))
    }
  }

  return Decoration.set(decorations, true)
}

export function highlightExtension(): Extension {
  return highlightField
}
