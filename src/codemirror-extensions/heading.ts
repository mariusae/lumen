import { EditorState, Extension, Line, Range, StateField } from "@codemirror/state"
import { Decoration, DecorationSet, EditorView, WidgetType } from "@codemirror/view"

const FOLD_COMMENT = "<!-- folded -->"
const FOLD_COMMENT_RE = /\s*<!--\s*folded\s*-->\s*$/

class FoldToggleWidget extends WidgetType {
  constructor(
    private folded: boolean,
    private headingFrom: number,
    private headingTo: number,
  ) {
    super()
  }

  eq(other: FoldToggleWidget) {
    return this.folded === other.folded && this.headingFrom === other.headingFrom
  }

  toDOM(view: EditorView) {
    const button = document.createElement("button")
    button.className = "cm-heading-fold-toggle"
    button.setAttribute("aria-label", this.folded ? "Unfold section" : "Fold section")
    if (this.folded) button.setAttribute("data-folded", "true")
    button.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M6 3.5L11 8L6 12.5V3.5Z"/></svg>`

    button.addEventListener("mousedown", (e) => {
      e.preventDefault()
      e.stopPropagation()

      const line = view.state.doc.lineAt(this.headingFrom)
      const lineText = line.text

      if (FOLD_COMMENT_RE.test(lineText)) {
        // Unfold: remove the comment
        const newText = lineText.replace(FOLD_COMMENT_RE, "")
        view.dispatch({
          changes: { from: line.from, to: line.to, insert: newText },
        })
      } else {
        // Fold: add the comment
        view.dispatch({
          changes: { from: line.to, insert: ` ${FOLD_COMMENT}` },
        })
      }
    })

    return button
  }

  ignoreEvent() {
    return true
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
      // Return position just before this line (end of previous line)
      return line.from - 1
    }
    lineNum++
  }
  // Fold to end of document
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
        widget: new FoldToggleWidget(heading.folded, heading.line.from, heading.line.to),
        side: -1,
      }).range(heading.line.from),
    )

    // If folded, hide the content between this heading and the next same-or-higher-level heading
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
  ".cm-heading-fold-toggle": {
    position: "absolute",
    left: "-24px",
    top: "50%",
    transform: "translateY(-50%)",
    display: "grid",
    placeItems: "center",
    width: "20px",
    height: "20px",
    border: "none",
    background: "none",
    padding: "0",
    borderRadius: "var(--border-radius-sm, 3px)",
    color: "var(--color-text-tertiary, #999)",
    opacity: "0",
    cursor: "pointer",
    transition: "opacity 0.15s, color 0.15s",
  },
  ".cm-heading-fold-toggle svg": {
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
  ".cm-line:hover .cm-heading-fold-toggle": {
    opacity: "1",
  },
  ".cm-heading-fold-toggle:hover": {
    color: "var(--color-text, #333)",
  },
  // Ensure heading lines have relative positioning for the toggle
  ".cm-line[data-heading-level]": {
    position: "relative",
  },
})

export function headingExtension(): Extension {
  return [headingField, headingFoldStyle]
}
