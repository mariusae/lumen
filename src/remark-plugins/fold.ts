import { Root, Content } from "mdast"
import { Plugin } from "unified"

const FOLD_COMMENT_RE = /\s*<!--\s*folded\s*-->\s*$/

/**
 * Remark plugin that implements heading folding.
 *
 * When a heading ends with `<!-- folded -->`, the content between that heading
 * and the next heading of the same or higher level is wrapped in a hidden div.
 * The comment is also stripped from the heading text.
 */
export function remarkFold(): ReturnType<Plugin<[], Root>> {
  return (tree: Root) => {
    const newChildren: Content[] = []
    let i = 0

    while (i < tree.children.length) {
      const node = tree.children[i]

      if (node.type === "heading") {
        // Check if the last child of the heading is an HTML comment matching <!-- folded -->
        const lastChild = node.children[node.children.length - 1]
        let isFolded = false

        if (lastChild?.type === "html" && FOLD_COMMENT_RE.test(lastChild.value)) {
          isFolded = true
          // Remove the comment from the heading
          const cleaned = lastChild.value.replace(FOLD_COMMENT_RE, "")
          if (cleaned) {
            lastChild.value = cleaned
          } else {
            node.children.pop()
          }
          // Also trim trailing whitespace from the preceding text node
          const prevChild = node.children[node.children.length - 1]
          if (prevChild?.type === "text") {
            prevChild.value = prevChild.value.replace(/\s+$/, "")
          }
        } else if (lastChild?.type === "text" && FOLD_COMMENT_RE.test(lastChild.value)) {
          isFolded = true
          lastChild.value = lastChild.value.replace(FOLD_COMMENT_RE, "")
          if (!lastChild.value) {
            node.children.pop()
          }
        }

        if (isFolded) {
          const depth = node.depth
          // Collect all nodes until the next heading of same or higher level
          const foldedNodes: Content[] = []
          let j = i + 1
          while (j < tree.children.length) {
            const next = tree.children[j]
            if (next.type === "heading" && next.depth <= depth) {
              break
            }
            foldedNodes.push(next)
            j++
          }

          // Mark this heading as folded via data attribute
          ;(node.data ??= {}) as Record<string, unknown>
          ;(node.data as Record<string, unknown>).hProperties = {
            ...((node.data as Record<string, unknown>).hProperties as object),
            "data-folded": "true",
          }

          newChildren.push(node)

          // Wrap folded content in a hidden div using raw HTML nodes
          if (foldedNodes.length > 0) {
            newChildren.push({
              type: "html",
              value: '<div class="heading-fold-content" hidden>',
            } as Content)
            newChildren.push(...foldedNodes)
            newChildren.push({
              type: "html",
              value: "</div>",
            } as Content)
          }

          i = j
          continue
        }
      }

      newChildren.push(tree.children[i])
      i++
    }

    tree.children = newChildren
  }
}
