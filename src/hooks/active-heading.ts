import React from "react"
import { Heading, extractHeadings } from "../components/heading-nav"

const HEADING_TAG_RE = /^H([1-6])$/

/** Query heading elements inside the main note's .markdown container only. */
function getReadModeHeadingElements(scrollContainer: HTMLElement): HTMLElement[] {
  // Scope to [data-note-content] to avoid picking up headings from backlinks/embeds
  const noteContent = scrollContainer.querySelector("[data-note-content]")
  if (!noteContent) return []
  return Array.from(
    noteContent.querySelectorAll<HTMLElement>(
      ".markdown h1, .markdown h2, .markdown h3, .markdown h4, .markdown h5, .markdown h6",
    ),
  )
}

/** Query heading-decorated CodeMirror lines within a scroll container. */
function getWriteModeHeadingElements(scrollContainer: HTMLElement): HTMLElement[] {
  return Array.from(scrollContainer.querySelectorAll<HTMLElement>(".cm-line[data-heading-level]"))
}

/** Build a Heading[] from rendered DOM elements in read mode. */
function extractHeadingsFromDOM(scrollContainer: HTMLElement): Heading[] {
  const elements = getReadModeHeadingElements(scrollContainer)
  return elements.map((el, index) => {
    const tagMatch = el.tagName.match(HEADING_TAG_RE)
    const level = tagMatch ? Number(tagMatch[1]) : 1
    return {
      level,
      text: el.textContent?.trim() ?? "",
      index,
    }
  })
}

/**
 * Track which heading is currently at the top of the viewport.
 *
 * In read mode, headings are extracted from the rendered DOM so that wikilinks,
 * dates, etc. appear in their displayed form (e.g. "Fri, Feb 13" instead of
 * "[[2026-02-13]]"). In write mode, headings are parsed from the raw markdown.
 *
 * When the document doesn't begin with a heading, a pseudo-header using the
 * note's display name is prepended so there's always a breadcrumb visible.
 */
export function useActiveHeading(
  scrollContainer: HTMLElement | null,
  markdown: string,
  mode: "read" | "write",
  displayName?: string,
) {
  const rawMarkdownHeadings = React.useMemo(() => extractHeadings(markdown), [markdown])

  // Does the document content (after frontmatter) start with a heading?
  const startsWithHeading = React.useMemo(() => {
    let content = markdown
    if (content.startsWith("---\n")) {
      const endIndex = content.indexOf("\n---\n", 4)
      if (endIndex !== -1) {
        content = content.slice(endIndex + 5)
      }
    }
    return /^#{1,6}\s/.test(content.trimStart())
  }, [markdown])

  const [rawDomHeadings, setRawDomHeadings] = React.useState<Heading[]>([])
  const [activeIndex, setActiveIndex] = React.useState(-1)

  // Prepend a pseudo-header when the doc has headings but doesn't start with one,
  // so the pre-heading content is navigable via the breadcrumb.
  const hasHeadings = rawMarkdownHeadings.length > 0
  const needsPseudoHeader = hasHeadings && !startsWithHeading && !!displayName
  const pseudoHeader: Heading | null = needsPseudoHeader
    ? { level: 0, text: displayName, index: -1 }
    : null

  const headings = React.useMemo(() => {
    const raw = mode === "read" ? rawDomHeadings : rawMarkdownHeadings
    if (!pseudoHeader) return raw
    return [pseudoHeader, ...raw]
  }, [mode, rawDomHeadings, rawMarkdownHeadings, pseudoHeader])

  React.useEffect(() => {
    if (!scrollContainer) {
      setActiveIndex(-1)
      setRawDomHeadings([])
      return
    }

    function getHeadingElements(): HTMLElement[] {
      if (!scrollContainer) return []
      return mode === "read"
        ? getReadModeHeadingElements(scrollContainer)
        : getWriteModeHeadingElements(scrollContainer)
    }

    function update() {
      if (!scrollContainer) return

      if (mode === "read") {
        setRawDomHeadings(extractHeadingsFromDOM(scrollContainer))
      }

      const containerRect = scrollContainer.getBoundingClientRect()
      const containerBottom = containerRect.bottom
      const threshold = containerRect.top + 80

      const elements = getHeadingElements()

      // Find the last heading whose top is at or above the threshold (scrolled past)
      let bestIdx = -1
      for (let i = 0; i < elements.length; i++) {
        const rect = elements[i].getBoundingClientRect()
        if (rect.top <= threshold) {
          bestIdx = i
        } else {
          break
        }
      }

      // If no heading has been scrolled past, use the first heading
      // that is visible in the viewport
      if (bestIdx === -1) {
        for (let i = 0; i < elements.length; i++) {
          const rect = elements[i].getBoundingClientRect()
          if (rect.top < containerBottom) {
            bestIdx = i
            break
          }
        }
      }

      // Shift index to account for pseudo-header at position 0
      const offset = needsPseudoHeader ? 1 : 0

      if (bestIdx >= 0) {
        setActiveIndex(bestIdx + offset)
      } else if (needsPseudoHeader) {
        // Before any real heading is visible, activate the pseudo-header
        setActiveIndex(0)
      } else {
        setActiveIndex(-1)
      }
    }

    update()

    scrollContainer.addEventListener("scroll", update, { passive: true })
    const observer = new ResizeObserver(update)
    observer.observe(scrollContainer)

    return () => {
      scrollContainer.removeEventListener("scroll", update)
      observer.disconnect()
    }
  }, [scrollContainer, rawMarkdownHeadings, mode, needsPseudoHeader])

  const scrollToHeading = React.useCallback(
    (heading: Heading) => {
      if (!scrollContainer) return

      // Pseudo-header: scroll to the top of the document
      if (heading.index === -1) {
        scrollContainer.scrollTo({ top: 0, behavior: "smooth" })
        return
      }

      const elements =
        mode === "read"
          ? getReadModeHeadingElements(scrollContainer)
          : getWriteModeHeadingElements(scrollContainer)

      const element = elements[heading.index]
      if (element) {
        const containerRect = scrollContainer.getBoundingClientRect()
        const elementRect = element.getBoundingClientRect()
        const offset = elementRect.top - containerRect.top + scrollContainer.scrollTop
        scrollContainer.scrollTo({ top: offset - 8, behavior: "smooth" })
      }
    },
    [scrollContainer, mode],
  )

  return { headings, activeHeadingIndex: activeIndex, scrollToHeading }
}
