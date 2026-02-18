import {
  Annotation,
  EditorState,
  Extension,
  Line,
  Range,
  RangeSet,
  StateField,
} from "@codemirror/state"
import { Decoration, DecorationSet, EditorView, GutterMarker, gutter } from "@codemirror/view"

/** Annotation used to mark fold-toggle transactions so the auto-unfold listener skips them. */
const foldToggle = Annotation.define<boolean>()

const FOLD_COMMENT = "<!-- folded -->"
const FOLD_COMMENT_RE = /\s*<!--\s*folded\s*-->\s*$/

// ── Gutter marker for fold toggle ──────────────────────────────────

class FoldGutterMarker extends GutterMarker {
  constructor(
    readonly folded: boolean,
    readonly headingFrom: number,
  ) {
    super()
  }

  eq(other: FoldGutterMarker) {
    return this.folded === other.folded && this.headingFrom === other.headingFrom
  }

  toDOM(view: EditorView) {
    const button = document.createElement("span")
    button.className = "cm-heading-fold-toggle"
    button.setAttribute("role", "button")
    button.setAttribute("aria-label", this.folded ? "Unfold section" : "Fold section")
    if (this.folded) button.setAttribute("data-folded", "true")
    button.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M6 3.5L11 8L6 12.5V3.5Z"/></svg>`

    const headingFrom = this.headingFrom
    button.addEventListener("mousedown", (e) => {
      e.preventDefault()
      e.stopPropagation()

      const state = view.state
      const line = state.doc.lineAt(headingFrom)
      const lineText = line.text

      if (FOLD_COMMENT_RE.test(lineText)) {
        const newText = lineText.replace(FOLD_COMMENT_RE, "")
        view.dispatch({
          changes: { from: line.from, to: line.to, insert: newText },
          annotations: foldToggle.of(true),
        })
      } else {
        view.dispatch({
          changes: { from: line.to, insert: ` ${FOLD_COMMENT}` },
          annotations: foldToggle.of(true),
        })
      }
    })

    return button
  }
}

// ── Heading analysis ───────────────────────────────────────────────

interface HeadingInfo {
  line: Line
  level: number
  folded: boolean
}

function findHeadings(state: EditorState): HeadingInfo[] {
  const headings: HeadingInfo[] = []
  for (let i = 1; i <= state.doc.lines; i++) {
    const line = state.doc.line(i)
    const match = line.text.match(/^(#{1,6})\s/)
    if (match) {
      headings.push({
        line,
        level: match[1].length,
        folded: FOLD_COMMENT_RE.test(line.text),
      })
    }
  }
  return headings
}

/** Find the end position (exclusive) of a folded section. */
function findFoldEnd(state: EditorState, headingLine: Line, level: number): number {
  let lineNum = headingLine.number + 1
  const totalLines = state.doc.lines
  while (lineNum <= totalLines) {
    const line = state.doc.line(lineNum)
    const match = line.text.match(/^(#{1,6})\s/)
    if (match && match[1].length <= level) {
      return line.from - 1
    }
    lineNum++
  }
  return state.doc.length
}

// ── Line decorations (heading style + fold replace) ────────────────

function buildLineDecorations(state: EditorState): DecorationSet {
  const decorations: Range<Decoration>[] = []
  const headings = findHeadings(state)

  for (const heading of headings) {
    let fontSize = ""
    if (heading.level === 1) {
      fontSize = "var(--font-size-xl)"
    } else if (heading.level === 2) {
      fontSize = "var(--font-size-lg)"
    }

    decorations.push(
      Decoration.line({
        attributes: {
          style: `font-weight: var(--font-weight-bold);${fontSize ? ` font-size: ${fontSize};` : ""}`,
          "data-heading-level": String(heading.level),
          ...(heading.folded ? { "data-heading-folded": "true" } : {}),
        },
      }).range(heading.line.from),
    )

    if (heading.folded) {
      const foldEnd = findFoldEnd(state, heading.line, heading.level)
      if (foldEnd > heading.line.to) {
        decorations.push(
          Decoration.replace({
            block: true,
          }).range(heading.line.to, foldEnd),
        )
      }
    }
  }

  decorations.sort((a, b) => a.from - b.from || a.value.startSide - b.value.startSide)
  return Decoration.set(decorations)
}

const lineDecorationField = StateField.define<DecorationSet>({
  create(state) {
    return buildLineDecorations(state)
  },
  update(decorations, tr) {
    if (tr.docChanged) {
      return buildLineDecorations(tr.state)
    }
    return decorations
  },
  provide: (f) => EditorView.decorations.from(f),
})

// ── Gutter markers ─────────────────────────────────────────────────

function buildGutterMarkers(state: EditorState): RangeSet<FoldGutterMarker> {
  const markers: Range<FoldGutterMarker>[] = []
  const headings = findHeadings(state)

  for (const heading of headings) {
    markers.push(new FoldGutterMarker(heading.folded, heading.line.from).range(heading.line.from))
  }

  return RangeSet.of(markers)
}

const gutterMarkerField = StateField.define<RangeSet<FoldGutterMarker>>({
  create(state) {
    return buildGutterMarkers(state)
  },
  update(markers, tr) {
    if (tr.docChanged) {
      return buildGutterMarkers(tr.state)
    }
    return markers
  },
})

const foldGutter = gutter({
  class: "cm-heading-fold-gutter",
  markers: (view) => view.state.field(gutterMarkerField),
})

// ── Theme ──────────────────────────────────────────────────────────

const headingFoldTheme = EditorView.baseTheme({
  ".cm-heading-fold-gutter": {
    width: "20px",
    cursor: "default",
  },
  ".cm-heading-fold-gutter .cm-gutterElement": {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0 !important",
  },
  ".cm-heading-fold-toggle": {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "20px",
    height: "20px",
    border: "none",
    background: "none",
    padding: "0",
    borderRadius: "var(--border-radius-sm, 3px)",
    color: "var(--color-text-tertiary, #999)",
    cursor: "pointer",
    transition: "color 0.15s",
  },
  ".cm-heading-fold-toggle svg": {
    transition: "transform 0.15s",
    transform: "rotate(90deg)",
  },
  ".cm-heading-fold-toggle[data-folded] svg": {
    transform: "rotate(0deg)",
  },
  ".cm-heading-fold-toggle[data-folded]": {
    color: "var(--color-text-secondary, #666)",
  },
  ".cm-heading-fold-toggle:hover": {
    color: "var(--color-text, #333)",
  },
})

// ── Auto-unfold when editing a folded heading ─────────────────────

const autoUnfold = EditorView.updateListener.of((update) => {
  if (!update.docChanged) return

  // Skip if this change was dispatched by the fold toggle itself
  for (const tr of update.transactions) {
    if (tr.annotation(foldToggle)) return
  }

  // Check if any change touched a folded heading line — if so, unfold it.
  // This handles typing at the end of a folded heading, pressing Enter, etc.
  const changes: { from: number; to: number; insert: string }[] = []

  update.changes.iterChangedRanges((_fromA, _toA, fromB, toB) => {
    const state = update.state
    // Check lines in the changed range of the new document
    const startLine = state.doc.lineAt(fromB)
    const endLine = state.doc.lineAt(Math.min(toB, state.doc.length))

    for (let lineNum = startLine.number; lineNum <= endLine.number; lineNum++) {
      const line = state.doc.line(lineNum)
      if (/^#{1,6}\s/.test(line.text) && FOLD_COMMENT_RE.test(line.text)) {
        const newText = line.text.replace(FOLD_COMMENT_RE, "")
        changes.push({ from: line.from, to: line.to, insert: newText })
      }
    }
  })

  if (changes.length > 0) {
    update.view.dispatch({ changes })
  }
})

// ── Extension ──────────────────────────────────────────────────────

export function headingExtension(): Extension {
  return [lineDecorationField, gutterMarkerField, foldGutter, autoUnfold, headingFoldTheme]
}
