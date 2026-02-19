import { Annotation, EditorState, Extension, Line, Range, StateField } from "@codemirror/state"
import { Decoration, DecorationSet, EditorView, WidgetType } from "@codemirror/view"

/** Annotation used to mark fold-toggle transactions so the auto-unfold listener skips them. */
const foldToggle = Annotation.define<boolean>()

const FOLD_COMMENT = "<!-- folded -->"
const FOLD_COMMENT_RE = /\s*<!--\s*folded\s*-->\s*$/

// ── Right-side heading action widget (fold / unfold) ─────────────

class HeadingActionWidget extends WidgetType {
  constructor(
    private headingFrom: number,
    private isFolded: boolean,
  ) {
    super()
  }

  eq(other: HeadingActionWidget) {
    return this.headingFrom === other.headingFrom && this.isFolded === other.isFolded
  }

  toDOM(view: EditorView) {
    const btn = document.createElement("span")
    btn.className = "cm-heading-action"
    if (this.isFolded) btn.classList.add("cm-heading-action-folded")
    btn.setAttribute("role", "button")
    btn.setAttribute("aria-label", this.isFolded ? "Unfold section" : "Fold section")

    // SVG icon: three-dot more icon when folded, pilcrow (¶) when unfolded
    if (this.isFolded) {
      btn.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">' +
        '<path d="M1.5 6a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM8 6a1.5 1.5 0 110 3 1.5 1.5 0 010-3zm6.5 0a1.5 1.5 0 110 3 1.5 1.5 0 010-3z"/>' +
        "</svg>"
    } else {
      btn.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">' +
        '<path d="M6.5 1C4.567 1 3 2.567 3 4.5S4.567 8 6.5 8H7v6.5a.75.75 0 001.5 0V2.5H10v12a.75.75 0 001.5 0V2.5h.75a.75.75 0 000-1.5H6.5zM4.5 4.5a2 2 0 012-2H7v4H6.5a2 2 0 01-2-2z"/>' +
        "</svg>"
    }

    const headingFrom = this.headingFrom
    const isFolded = this.isFolded

    btn.addEventListener("mousedown", (e) => {
      e.preventDefault()
      e.stopPropagation()

      const line = view.state.doc.lineAt(headingFrom)
      if (isFolded) {
        const newText = line.text.replace(FOLD_COMMENT_RE, "")
        view.dispatch({
          changes: { from: line.from, to: line.to, insert: newText },
          annotations: foldToggle.of(true),
        })
      } else {
        view.dispatch({
          changes: { from: line.to, to: line.to, insert: " " + FOLD_COMMENT },
          annotations: foldToggle.of(true),
        })
      }
    })

    return btn
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

    // Line decoration for heading styling (position: relative for action icon)
    decorations.push(
      Decoration.line({
        attributes: {
          style: `font-weight: var(--font-weight-bold); position: relative; padding-right: 2rem;${fontSize ? ` font-size: ${fontSize};` : ""}`,
          "data-heading-level": String(heading.level),
          ...(heading.folded ? { "data-heading-folded": "true" } : {}),
        },
      }).range(heading.line.from),
    )

    if (heading.folded) {
      // Hide the <!-- folded --> comment (no inline widget)
      const commentMatch = heading.line.text.match(FOLD_COMMENT_RE)
      if (commentMatch) {
        const commentStart = heading.line.from + commentMatch.index!
        decorations.push(Decoration.replace({}).range(commentStart, heading.line.to))
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

    // Right-side action widget for all headings
    decorations.push(
      Decoration.widget({
        widget: new HeadingActionWidget(heading.line.from, heading.folded),
        side: 1,
      }).range(heading.line.to),
    )
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
  ".cm-heading-action": {
    position: "absolute",
    right: "0",
    top: "50%",
    transform: "translateY(-50%)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "1.5rem",
    height: "1.5rem",
    borderRadius: "0.25rem",
    color: "var(--color-text-secondary, #666)",
    cursor: "pointer",
    opacity: "0",
    transition: "opacity 0.15s, background-color 0.15s",
  },
  ".cm-line:hover .cm-heading-action": {
    opacity: "1",
  },
  // Folded icon is always visible
  ".cm-heading-action-folded": {
    opacity: "1",
  },
  ".cm-heading-action:hover": {
    backgroundColor: "var(--color-bg-hover, rgba(0,0,0,0.05))",
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
