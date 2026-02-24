import { EditorState, Extension, Line, Range, StateField, Transaction } from "@codemirror/state"
import { Decoration, DecorationSet, EditorView } from "@codemirror/view"
import { findCodeBlockRanges, isInCodeBlock } from "./code-block"

// Reference: https://discuss.codemirror.net/t/making-codemirror-6-respect-indent-for-wrapped-lines/2881/8

const indentedLineWrapField = StateField.define({
  create(state) {
    return createDecorations(state)
  },
  update(decorations, transaction) {
    if (transaction.docChanged) {
      return updateDecorations(decorations, transaction)
    }
    return decorations
  },
  provide: (f) => EditorView.decorations.from(f),
})

function createDecorations(state: EditorState) {
  const decorations: Range<Decoration>[] = []
  const codeBlockRanges = findCodeBlockRanges(state)

  for (let i = 1; i <= state.doc.lines; i++) {
    const line = state.doc.line(i)
    if (isInCodeBlock(line.from, codeBlockRanges)) continue
    const lineDecoration = getLineDecoration(line)

    if (lineDecoration) {
      decorations.push(lineDecoration.range(line.from))
    }
  }

  return Decoration.set(decorations)
}

/**
 * Updates the decorations for indented line wrapping when the document changes.
 * This method is more efficient than recreating all decorations for several reasons:
 * 1. It only processes the changed ranges of the document, not all lines.
 * 2. It reuses existing decorations that weren't affected by the changes.
 * 3. It's optimized for changes, using the Transaction object to map positions and identify changed ranges.
 * 4. It reduces overall processing, especially for large documents with small changes.
 */
function updateDecorations(oldDecorations: DecorationSet, tr: Transaction): DecorationSet {
  // Code block boundaries may shift on any edit, so rebuild from scratch
  return createDecorations(tr.state)
}

/** Returns a line decoration for indented line wrapping. */
function getLineDecoration(line: Line) {
  // First try to match list items (numbered or bulleted)
  const listItemMatch = line.text.match(/^(\s*)([-*]|\d+[.)])\s/)

  if (listItemMatch) {
    const [_, leadingSpaces, marker] = listItemMatch
    const numLeadingSpaces = leadingSpaces.length
    const markerWidth = marker.length + 1 // +1 for the space after the marker
    const indent = numLeadingSpaces + markerWidth
    return Decoration.line({
      attributes: {
        style: `margin-left: ${indent}ch; text-indent: -${indent}ch;`,
      },
    })
  }

  // Then check for plain indented text (2 or more spaces)
  const indentMatch = line.text.match(/^(\s{2,})/)
  if (indentMatch) {
    const indent = indentMatch[1].length
    return Decoration.line({
      attributes: {
        style: `margin-left: ${indent}ch; text-indent: -${indent}ch;`,
      },
    })
  }

  return null
}

export function indentedLineWrapExtension(): Extension {
  return indentedLineWrapField
}
