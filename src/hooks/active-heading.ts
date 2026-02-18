import React from "react"
import { Heading, extractHeadings } from "../components/heading-nav"

const HEADING_TAG_RE = /^H([1-6])$/

/** Query heading elements inside .markdown containers within a scroll container. */
function getReadModeHeadingElements(scrollContainer: HTMLElement): HTMLElement[] {
  return Array.from(
    scrollContainer.querySelectorAll<HTMLElement>(
      ".markdown h1, .markdown h2, .markdown h3, .markdown h4, .markdown h5, .markdown h6",
    ),
  )
}

/** Query heading-decorated CodeMirror lines within a scroll container. */
function getWriteModeHeadingElements(scrollContainer: HTMLElement): HTMLElement[] {
  return Array.from(scrollContainer.querySelectorAll<HTMLElement>(".cm-line")).filter(
    (el) => el.style.fontWeight !== "",
  )
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
 */
export function useActiveHeading(
  scrollContainer: HTMLElement | null,
  markdown: string,
  mode: "read" | "write",
) {
  const markdownHeadings = React.useMemo(() => extractHeadings(markdown), [markdown])
  const [domHeadings, setDomHeadings] = React.useState<Heading[]>([])
  const [activeIndex, setActiveIndex] = React.useState(-1)

  const headings = mode === "read" ? domHeadings : markdownHeadings

  React.useEffect(() => {
    if (!scrollContainer) {
      setActiveIndex(-1)
      setDomHeadings([])
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

      // In read mode, refresh headings from the DOM on each update
      // so we always have the rendered text
      if (mode === "read") {
        setDomHeadings(extractHeadingsFromDOM(scrollContainer))
      }

      const containerRect = scrollContainer.getBoundingClientRect()
      const threshold = containerRect.top + 80

      const elements = getHeadingElements()

      let bestIdx = -1
      for (let i = 0; i < elements.length; i++) {
        const rect = elements[i].getBoundingClientRect()
        if (rect.top <= threshold) {
          bestIdx = i
        } else {
          break
        }
      }

      const currentHeadings = mode === "read" ? elements : markdownHeadings
      if (bestIdx >= 0 && bestIdx < currentHeadings.length) {
        setActiveIndex(bestIdx)
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
  }, [scrollContainer, markdownHeadings, mode])

  const scrollToHeading = React.useCallback(
    (heading: Heading) => {
      if (!scrollContainer) return

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
