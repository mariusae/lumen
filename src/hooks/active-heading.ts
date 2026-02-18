import React from "react"
import { Heading, extractHeadings } from "../components/heading-nav"

/**
 * Track which heading is currently at the top of the viewport.
 *
 * For both read and write modes, we find heading elements in the DOM inside
 * the scroll container and determine which one is at or just above the visible area.
 *
 * @param scrollContainer - The scrollable element (the `<main>` from PageLayout)
 * @param markdown - The raw markdown text (to extract heading metadata)
 * @param mode - "read" or "write"
 */
export function useActiveHeading(
  scrollContainer: HTMLElement | null,
  markdown: string,
  mode: "read" | "write",
) {
  const headings = React.useMemo(() => extractHeadings(markdown), [markdown])
  const [activeIndex, setActiveIndex] = React.useState(-1)

  React.useEffect(() => {
    if (!scrollContainer || headings.length === 0) {
      setActiveIndex(-1)
      return
    }

    function update() {
      if (!scrollContainer) return

      const containerRect = scrollContainer.getBoundingClientRect()
      // Threshold: a heading is "active" if its top is within this distance of the container top
      const threshold = containerRect.top + 80

      let headingElements: Element[]

      if (mode === "read") {
        // In read mode, query semantic heading elements inside .markdown
        headingElements = Array.from(
          scrollContainer.querySelectorAll(
            ".markdown h1, .markdown h2, .markdown h3, .markdown h4, .markdown h5, .markdown h6",
          ),
        )
      } else {
        // In write mode, query CodeMirror lines that have heading font-weight styling
        // The heading extension applies inline styles with font-weight: var(--font-weight-bold)
        headingElements = Array.from(scrollContainer.querySelectorAll(".cm-line")).filter((el) => {
          const style = (el as HTMLElement).style
          return style.fontWeight !== ""
        })
      }

      // Find the last heading element whose top is at or above the threshold
      let bestIdx = -1
      for (let i = 0; i < headingElements.length; i++) {
        const rect = headingElements[i].getBoundingClientRect()
        if (rect.top <= threshold) {
          bestIdx = i
        } else {
          break
        }
      }

      // Map DOM element index to heading index
      // In both modes, headings appear in document order, so DOM index maps to heading index
      if (bestIdx >= 0 && bestIdx < headings.length) {
        setActiveIndex(bestIdx)
      } else if (bestIdx === -1) {
        setActiveIndex(-1)
      }
    }

    update()

    scrollContainer.addEventListener("scroll", update, { passive: true })
    // Also listen for resize since layout changes affect positions
    const observer = new ResizeObserver(update)
    observer.observe(scrollContainer)

    return () => {
      scrollContainer.removeEventListener("scroll", update)
      observer.disconnect()
    }
  }, [scrollContainer, headings, mode])

  const scrollToHeading = React.useCallback(
    (heading: Heading) => {
      if (!scrollContainer) return

      let headingElements: Element[]

      if (mode === "read") {
        headingElements = Array.from(
          scrollContainer.querySelectorAll(
            ".markdown h1, .markdown h2, .markdown h3, .markdown h4, .markdown h5, .markdown h6",
          ),
        )
      } else {
        headingElements = Array.from(scrollContainer.querySelectorAll(".cm-line")).filter((el) => {
          const style = (el as HTMLElement).style
          return style.fontWeight !== ""
        })
      }

      const element = headingElements[heading.index]
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
