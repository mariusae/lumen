import { Annotation, EditorState, Extension, Line, Range, StateField } from "@codemirror/state"
import { Decoration, DecorationSet, EditorView, WidgetType } from "@codemirror/view"

/** Annotation used to mark fold-toggle transactions so the auto-unfold listener skips them. */
const foldToggle = Annotation.define<boolean>()

const FOLD_COMMENT = "<!-- folded -->"
const FOLD_COMMENT_RE = /\s*<!--\s*folded\s*-->\s*$/

// ── Ellipsis pill widget (unfold) ──────────────────────────────────

class FoldPillWidget extends WidgetType {
  constructor(private headingFrom: number) {
    super()
  }

  eq(other: FoldPillWidget) {
    return this.headingFrom === other.headingFrom
  }

  toDOM(view: EditorView) {
    const pill = document.createElement("span")
    pill.className = "cm-heading-fold-pill"
    pill.setAttribute("role", "button")
    pill.setAttribute("aria-label", "Unfold section")
    pill.textContent = "\u2026" // …

    const headingFrom = this.headingFrom
    pill.addEventListener("mousedown", (e) => {
      e.preventDefault()
      e.stopPropagation()

      const line = view.state.doc.lineAt(headingFrom)
      const newText = line.text.replace(FOLD_COMMENT_RE, "")
      view.dispatch({
        changes: { from: line.from, to: line.to, insert: newText },
        annotations: foldToggle.of(true),
      })
    })

    return pill
  }

  ignoreEvent() {
    return false
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

// ── Decorations ────────────────────────────────────────────────────

function buildDecorations(state: EditorState): DecorationSet {
  const decorations: Range<Decoration>[] = []
  const headings = findHeadings(state)

  for (const heading of headings) {
    let fontSize = ""
    if (heading.level === 1) {
      fontSize = "var(--font-size-xl)"
    } else if (heading.level === 2) {
      fontSize = "var(--font-size-lg)"
    }

    // Line decoration for heading styling
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
      // Replace the <!-- folded --> comment with the ellipsis pill widget
      const commentMatch = heading.line.text.match(FOLD_COMMENT_RE)
      if (commentMatch) {
        const commentStart = heading.line.from + commentMatch.index!
        decorations.push(
          Decoration.replace({
            widget: new FoldPillWidget(heading.line.from),
          }).range(commentStart, heading.line.to),
        )
      }

      // Hide the folded content
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

const headingField = StateField.define<DecorationSet>({
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

// ── Theme ──────────────────────────────────────────────────────────

const headingTheme = EditorView.baseTheme({
  ".cm-heading-fold-pill": {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    verticalAlign: "middle",
    marginLeft: "0.5em",
    paddingLeft: "0.5em",
    paddingRight: "0.5em",
    height: "1.4em",
    border: "none",
    borderRadius: "999px",
    backgroundColor: "var(--color-bg-secondary, #f0f0f0)",
    color: "var(--color-text-tertiary, #999)",
    fontSize: "0.7em",
    lineHeight: "1",
    letterSpacing: "0.1em",
    cursor: "pointer",
    transition: "background-color 0.15s, color 0.15s",
  },
  ".cm-heading-fold-pill:hover": {
    backgroundColor: "var(--color-bg-secondary-hover, var(--color-bg-tertiary, #e0e0e0))",
    color: "var(--color-text-secondary, #666)",
  },
})

// ── Auto-unfold when editing a folded heading ─────────────────────

const autoUnfold = EditorView.updateListener.of((update) => {
  if (!update.docChanged) return

  // Skip if this change was dispatched by the fold toggle itself
  for (const tr of update.transactions) {
    if (tr.annotation(foldToggle)) return
  }

  // Only auto-unfold headings that were already folded before this edit.
  // This avoids stripping a fold comment the user just typed.
  const changes: { from: number; to: number; insert: string }[] = []

  update.changes.iterChangedRanges((fromA, _toA, fromB, toB) => {
    // Check whether the line in the old doc was already a folded heading
    const oldLine = update.startState.doc.lineAt(Math.min(fromA, update.startState.doc.length))
    if (!/^#{1,6}\s/.test(oldLine.text) || !FOLD_COMMENT_RE.test(oldLine.text)) return

    // It was already folded — unfold the corresponding line(s) in the new doc
    const state = update.state
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
  return [headingField, autoUnfold, headingTheme]
}
