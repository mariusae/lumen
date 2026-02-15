import { Root } from "mdast"
import { Plugin } from "unified"
import { visit } from "unist-util-visit"

const HIGHLIGHT_REGEX = /==((?:[^=]|=[^=])+?)==/g

/**
 * Remark plugin that transforms ==text== into <mark>text</mark>.
 * Uses rehype-raw (already enabled) to process the raw HTML nodes.
 */
export function remarkHighlight(): ReturnType<Plugin<[], Root>> {
  return (tree: Root) => {
    visit(tree, "text", (node: any, index: number | undefined, parent: any) => {
      if (index === undefined || !parent) return

      const text: string = node.value
      if (!text.includes("==")) return

      const regex = new RegExp(HIGHLIGHT_REGEX.source, "g")
      const newNodes: any[] = []
      let lastIndex = 0
      let match

      while ((match = regex.exec(text)) !== null) {
        if (match.index > lastIndex) {
          newNodes.push({ type: "text", value: text.slice(lastIndex, match.index) })
        }
        newNodes.push({ type: "html", value: "<mark>" })
        newNodes.push({ type: "text", value: match[1] })
        newNodes.push({ type: "html", value: "</mark>" })
        lastIndex = regex.lastIndex
      }

      if (newNodes.length === 0) return

      if (lastIndex < text.length) {
        newNodes.push({ type: "text", value: text.slice(lastIndex) })
      }

      parent.children.splice(index, 1, ...newNodes)
      return index + newNodes.length
    })
  }
}
