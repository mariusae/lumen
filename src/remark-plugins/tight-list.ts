import type { List, Parent, Root } from "mdast"
import type { Plugin } from "unified"

/**
 * Remark plugin that adds a 'tight-with-prev' class to lists that
 * immediately follow a paragraph (no blank line between them).
 *
 * This allows CSS to reduce the spacing so the paragraph and list
 * feel visually connected (e.g., "Today:\n* one\n* two").
 */
export const remarkTightList: Plugin<[], Root> = () => {
  return (tree: Root) => {
    processChildren(tree)
  }
}

function processChildren(node: Parent) {
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i]

    if (i > 0 && child.type === "list" && node.children[i - 1].type === "paragraph") {
      const prev = node.children[i - 1]
      const prevEndLine = prev.position?.end.line
      const childStartLine = child.position?.start.line

      if (
        prevEndLine !== undefined &&
        childStartLine !== undefined &&
        childStartLine === prevEndLine + 1
      ) {
        const list = child as List
        list.data = {
          ...list.data,
          hProperties: {
            ...((list.data?.hProperties ?? {}) as Record<string, unknown>),
            className: "tight-with-prev",
          },
        }
      }
    }

    // Recurse into container nodes (blockquotes, list items, etc.)
    if ("children" in child && Array.isArray((child as Parent).children)) {
      processChildren(child as Parent)
    }
  }
}
