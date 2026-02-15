import { fromMarkdown } from "mdast-util-from-markdown"
import { expect, test, describe } from "vitest"
import { visit } from "unist-util-visit"

// Test the highlight regex and transformation logic directly
const HIGHLIGHT_REGEX = /==((?:[^=]|=[^=])+?)==/g

function findHighlights(input: string): string[] {
  const results: string[] = []
  const regex = new RegExp(HIGHLIGHT_REGEX.source, "g")
  let match
  while ((match = regex.exec(input)) !== null) {
    results.push(match[1])
  }
  return results
}

describe("highlight regex", () => {
  test("basic highlight", () => {
    expect(findHighlights("==test==")).toEqual(["test"])
  })

  test("highlight within text", () => {
    expect(findHighlights("Hello ==world== today")).toEqual(["world"])
  })

  test("multiple highlights", () => {
    expect(findHighlights("==foo== and ==bar==")).toEqual(["foo", "bar"])
  })

  test("highlight with spaces", () => {
    expect(findHighlights("==hello world==")).toEqual(["hello world"])
  })

  test("single = is not a highlight", () => {
    expect(findHighlights("=test=")).toEqual([])
  })

  test("empty highlight is ignored", () => {
    expect(findHighlights("====")).toEqual([])
  })

  test("highlight with single = inside", () => {
    expect(findHighlights("==a=b==")).toEqual(["a=b"])
  })

  test("no match when no closing marker", () => {
    expect(findHighlights("==test")).toEqual([])
  })

  test("no match with only opening marker", () => {
    expect(findHighlights("== test")).toEqual([])
  })
})

describe("highlight tree transformation", () => {
  test("transforms text nodes with ==highlight==", async () => {
    const { remarkHighlight } = await import("./highlight")

    const tree = fromMarkdown("Hello ==world== today")
    const transformer = remarkHighlight.call({ data: () => ({}) } as any)

    if (typeof transformer === "function") {
      transformer(tree, {} as any, () => {})
    }

    const textValues: string[] = []
    const htmlValues: string[] = []

    visit(tree, (node: any) => {
      if (node.type === "text") textValues.push(node.value)
      if (node.type === "html") htmlValues.push(node.value)
    })

    expect(textValues).toContain("Hello ")
    expect(textValues).toContain("world")
    expect(textValues).toContain(" today")
    expect(htmlValues).toContain("<mark>")
    expect(htmlValues).toContain("</mark>")
  })

  test("does not transform text without ==", async () => {
    const { remarkHighlight } = await import("./highlight")

    const tree = fromMarkdown("Hello world")
    const transformer = remarkHighlight.call({ data: () => ({}) } as any)

    if (typeof transformer === "function") {
      transformer(tree, {} as any, () => {})
    }

    const htmlValues: string[] = []
    visit(tree, (node: any) => {
      if (node.type === "html") htmlValues.push(node.value)
    })

    expect(htmlValues).toEqual([])
  })

  test("handles multiple highlights in one text node", async () => {
    const { remarkHighlight } = await import("./highlight")

    const tree = fromMarkdown("==foo== and ==bar==")
    const transformer = remarkHighlight.call({ data: () => ({}) } as any)

    if (typeof transformer === "function") {
      transformer(tree, {} as any, () => {})
    }

    const htmlValues: string[] = []
    visit(tree, (node: any) => {
      if (node.type === "html") htmlValues.push(node.value)
    })

    expect(htmlValues).toEqual(["<mark>", "</mark>", "<mark>", "</mark>"])
  })
})
