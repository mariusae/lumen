import { EditorState, Extension, Range, StateField } from "@codemirror/state"
import { Decoration, DecorationSet, EditorView } from "@codemirror/view"

export interface CodeBlockRange {
  /** Document offset of the first character of the opening fence line. */
  from: number
  /** Document offset of the last character of the closing fence line (or end of doc). */
  to: number
}

/**
 * Find all fenced code block ranges in the document.
 * Handles both backtick (```) and tilde (~~~) fences per CommonMark spec.
 */
export function findCodeBlockRanges(state: EditorState): CodeBlockRange[] {
  const ranges: CodeBlockRange[] = []
  let inCodeBlock = false
  let fenceChar = ""
  let fenceLen = 0
  let blockStart = 0

  for (let i = 1; i <= state.doc.lines; i++) {
    const line = state.doc.line(i)
    const text = line.text

    if (!inCodeBlock) {
      const match = text.match(/^ {0,3}(`{3,}|~{3,})/)
      if (match) {
        inCodeBlock = true
        fenceChar = match[1][0]
        fenceLen = match[1].length
        blockStart = line.from
      }
    } else {
      const closingMatch = text.match(/^ {0,3}(`{3,}|~{3,})\s*$/)
      if (closingMatch && closingMatch[1][0] === fenceChar && closingMatch[1].length >= fenceLen) {
        ranges.push({ from: blockStart, to: line.to })
        inCodeBlock = false
      }
    }
  }

  // Unclosed code block extends to end of document
  if (inCodeBlock) {
    ranges.push({ from: blockStart, to: state.doc.length })
  }

  return ranges
}

/** Check whether a document position falls inside any code block range. */
export function isInCodeBlock(pos: number, ranges: CodeBlockRange[]): boolean {
  return ranges.some((r) => pos >= r.from && pos <= r.to)
}

// ── Line decorations for code block background ────────────────────

const codeBlockLineDeco = Decoration.line({ class: "cm-code-block" })

function buildDecorations(state: EditorState): DecorationSet {
  const decorations: Range<Decoration>[] = []
  const ranges = findCodeBlockRanges(state)

  for (const range of ranges) {
    const startLine = state.doc.lineAt(range.from)
    const endLine = state.doc.lineAt(range.to)
    for (let lineNum = startLine.number; lineNum <= endLine.number; lineNum++) {
      const line = state.doc.line(lineNum)
      decorations.push(codeBlockLineDeco.range(line.from))
    }
  }

  return Decoration.set(decorations)
}

const codeBlockField = StateField.define<DecorationSet>({
  create(state) {
    return buildDecorations(state)
  },
  update(decorations, tr) {
    if (tr.docChanged) {
      return buildDecorations(tr.state)
    }
    return decorations
  },
  provide: (f) => EditorView.decorations.from(f),
})

export function codeBlockExtension(): Extension {
  return codeBlockField
}
