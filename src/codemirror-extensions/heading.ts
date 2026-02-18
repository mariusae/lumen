import { EditorState, Extension, Line, Range, StateField } from "@codemirror/state"
import { Decoration, DecorationSet, EditorView, WidgetType } from "@codemirror/view"

const FOLD_COMMENT = "<!-- folded -->"
const FOLD_COMMENT_RE = /\s*<!--\s*folded\s*-->\s*$/

class FoldToggleWidget extends WidgetType {
  constructor(
    private folded: boolean,
    private headingFrom: number,
  ) {
    super()
  }

  eq(other: FoldToggleWidget) {
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
        })
      } else {
        view.dispatch({
          changes: { from: line.to, insert: ` ${FOLD_COMMENT}` },
        })
      }
    })

    return button
  }

  ignoreEvent() {
    return false
  }
}

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

    // Fold toggle widget at the start of the heading line
    decorations.push(
      Decoration.widget({
        widget: new FoldToggleWidget(heading.folded, heading.line.from),
        side: -1,
      }).range(heading.line.from),
    )

    // If folded, hide everything from end of heading line to next same-or-higher-level heading
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

const headingFoldStyle = EditorView.baseTheme({
  // The toggle is a zero-width inline element that overflows left into the
  // parent container's padding (the note page applies p-5 / p-10).
  ".cm-heading-fold-toggle": {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "0",
    overflow: "visible",
    verticalAlign: "middle",
    border: "none",
    background: "none",
    padding: "0",
    cursor: "pointer",
    color: "var(--color-text-tertiary, #999)",
    opacity: "0",
    transition: "opacity 0.15s, color 0.15s",
  },
  ".cm-heading-fold-toggle svg": {
    // Pull the 16px icon left so it sits in the parent's padding area
    marginLeft: "-24px",
    marginRight: "8px",
    transition: "transform 0.15s",
    transform: "rotate(90deg)",
  },
  ".cm-heading-fold-toggle[data-folded] svg": {
    transform: "rotate(0deg)",
  },
  ".cm-heading-fold-toggle[data-folded]": {
    opacity: "1",
    color: "var(--color-text-secondary, #666)",
  },
  ".cm-line[data-heading-level]:hover .cm-heading-fold-toggle": {
    opacity: "1",
  },
  ".cm-heading-fold-toggle:hover": {
    color: "var(--color-text, #333)",
  },
})

export function headingExtension(): Extension {
  return [headingField, headingFoldStyle]
}
