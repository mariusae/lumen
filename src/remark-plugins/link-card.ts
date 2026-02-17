import { Root } from "mdast"
import { Extension as FromMarkdownExtension } from "mdast-util-from-markdown"
import { codes } from "micromark-util-symbol/codes"
import { Code, Construct, Extension, HtmlExtension, State, Tokenizer } from "micromark-util-types"
import { Plugin } from "unified"
import { Node } from "unist"

const types = {
  linkCard: "linkCard",
  linkCardMarker: "linkCardMarker",
  linkCardTitle: "linkCardTitle",
  linkCardUrl: "linkCardUrl",
}

/** Syntax extension (text -> tokens) */
export function linkCard(): Extension {
  const tokenize: Tokenizer = (effects, ok, nok) => {
    return enter

    // @
    function enter(code: Code): State | void {
      if (code === codes.atSign) {
        effects.enter(types.linkCard)
        effects.enter(types.linkCardMarker)
        effects.consume(code)
        return afterAt
      }
      return nok(code)
    }

    // @[
    function afterAt(code: Code): State | void {
      if (code === codes.leftSquareBracket) {
        effects.consume(code)
        effects.exit(types.linkCardMarker)
        return enterTitle
      }
      return nok(code)
    }

    // @[...
    function enterTitle(code: Code): State | void {
      // Allow empty title: @[](url)
      if (code === codes.rightSquareBracket) {
        return afterTitle(code)
      }
      if (isTextChar(code)) {
        effects.enter(types.linkCardTitle)
        effects.consume(code)
        return continueTitle
      }
      return nok(code)
    }

    function continueTitle(code: Code): State | void {
      if (code === codes.rightSquareBracket) {
        effects.exit(types.linkCardTitle)
        return afterTitle(code)
      }
      if (isTextChar(code)) {
        effects.consume(code)
        return continueTitle
      }
      return nok(code)
    }

    // ]
    function afterTitle(code: Code): State | void {
      if (code === codes.rightSquareBracket) {
        effects.consume(code)
        return afterCloseBracket
      }
      return nok(code)
    }

    // ](
    function afterCloseBracket(code: Code): State | void {
      if (code === codes.leftParenthesis) {
        effects.consume(code)
        return enterUrl
      }
      return nok(code)
    }

    // @[title](... — start of URL
    function enterUrl(code: Code): State | void {
      if (isUrlChar(code)) {
        effects.enter(types.linkCardUrl)
        effects.consume(code)
        return continueUrl
      }
      return nok(code)
    }

    function continueUrl(code: Code): State | void {
      if (code === codes.rightParenthesis) {
        effects.exit(types.linkCardUrl)
        effects.consume(code)
        effects.exit(types.linkCard)
        return ok
      }
      if (isUrlChar(code)) {
        effects.consume(code)
        return continueUrl
      }
      return nok(code)
    }
  }

  const construct: Construct = {
    name: "linkCard",
    tokenize,
  }

  return {
    text: {
      [codes.atSign]: construct,
    },
  }
}

function isTextChar(code: Code): boolean {
  return (
    code !== null &&
    code !== codes.eof &&
    code !== codes.carriageReturn &&
    code !== codes.lineFeed &&
    code !== codes.carriageReturnLineFeed &&
    code !== codes.rightSquareBracket
  )
}

function isUrlChar(code: Code): boolean {
  return (
    code !== null &&
    code !== codes.eof &&
    code !== codes.carriageReturn &&
    code !== codes.lineFeed &&
    code !== codes.carriageReturnLineFeed &&
    code !== codes.rightParenthesis &&
    code !== codes.space
  )
}

/**
 * HTML extension (tokens -> HTML)
 * This is only used for unit testing
 */
export function linkCardHtml(): HtmlExtension {
  let title: string | undefined
  let url: string | undefined

  return {
    enter: {
      [types.linkCardTitle](token) {
        title = this.sliceSerialize(token)
      },
      [types.linkCardUrl](token) {
        url = this.sliceSerialize(token)
      },
    },
    exit: {
      [types.linkCard]() {
        this.tag(`<link-card title="${title || ""}" url="${url || ""}" />`)
        title = undefined
        url = undefined
      },
    },
  }
}

// Register linkCard as an mdast node type
interface LinkCard extends Node {
  type: "linkCard"
  data: { title: string; url: string }
}

declare module "mdast" {
  interface StaticPhrasingContentMap {
    linkCard: LinkCard
  }
}

/** MDAST extension (tokens -> MDAST) */
export function linkCardFromMarkdown(): FromMarkdownExtension {
  let title: string | undefined
  let url: string | undefined

  return {
    enter: {
      [types.linkCard](token) {
        this.enter({ type: "linkCard", data: { title: "", url: "" } }, token)
      },
      [types.linkCardTitle](token) {
        title = this.sliceSerialize(token)
      },
      [types.linkCardUrl](token) {
        url = this.sliceSerialize(token)
      },
    },
    exit: {
      [types.linkCard](token) {
        const node = this.stack[this.stack.length - 1]

        if (node.type === "linkCard") {
          node.data.title = title || ""
          node.data.url = url || ""
        }

        this.exit(token)

        title = undefined
        url = undefined
      },
    },
  }
}

/**
 * Remark plugin
 * Reference: https://github.com/remarkjs/remark-gfm/blob/main/index.js
 */
export function remarkLinkCard(): ReturnType<Plugin<[], Root>> {
  // @ts-ignore I'm not sure how to type `this`
  const data = this.data()

  add("micromarkExtensions", linkCard())
  add("fromMarkdownExtensions", linkCardFromMarkdown())

  function add(field: string, value: unknown) {
    const list = data[field] ? data[field] : (data[field] = [])
    list.push(value)
  }
}
