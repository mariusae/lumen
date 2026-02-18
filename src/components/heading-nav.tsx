import { Menu } from "@base-ui/react/menu"
import React from "react"
import { cx } from "../utils/cx"
import { ChevronRightIcon12 } from "./icons"

export type Heading = {
  level: number
  text: string
  /** Index among all headings (used for identification) */
  index: number
}

/** Extract headings from markdown text, skipping frontmatter. */
export function extractHeadings(markdown: string): Heading[] {
  const headings: Heading[] = []

  // Skip frontmatter
  let content = markdown
  if (content.startsWith("---\n")) {
    const endIndex = content.indexOf("\n---\n", 4)
    if (endIndex !== -1) {
      content = content.slice(endIndex + 5)
    }
  }

  const lines = content.split("\n")
  let headingIndex = 0
  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)/)
    if (match) {
      headings.push({
        level: match[1].length,
        text: match[2].replace(/\s+$/, ""),
        index: headingIndex,
      })
      headingIndex++
    }
  }
  return headings
}

/** Given a flat list of headings and the index of the "active" heading, return the breadcrumb trail. */
export function getHeadingBreadcrumb(headings: Heading[], activeIndex: number): Heading[] {
  if (activeIndex < 0 || activeIndex >= headings.length) return []

  const trail: Heading[] = []
  const active = headings[activeIndex]
  trail.push(active)

  // Walk backwards to find ancestors
  let currentLevel = active.level
  for (let i = activeIndex - 1; i >= 0; i--) {
    if (headings[i].level < currentLevel) {
      trail.unshift(headings[i])
      currentLevel = headings[i].level
      if (currentLevel === 1) break
    }
  }

  return trail
}

type HeadingNavProps = {
  noteId: string
  headings: Heading[]
  activeHeadingIndex: number
  onSelectHeading: (heading: Heading) => void
}

export function HeadingNav({
  noteId,
  headings,
  activeHeadingIndex,
  onSelectHeading,
}: HeadingNavProps) {
  const breadcrumb = React.useMemo(
    () => getHeadingBreadcrumb(headings, activeHeadingIndex),
    [headings, activeHeadingIndex],
  )

  return (
    <div className="flex min-w-0 items-center gap-0.5">
      <span className="shrink-0 truncate">{noteId}</span>
      {breadcrumb.map((heading) => (
        <React.Fragment key={heading.index}>
          <ChevronRightIcon12 className="shrink-0 text-text-tertiary" />
          <HeadingDropdown heading={heading} allHeadings={headings} onSelect={onSelectHeading} />
        </React.Fragment>
      ))}
    </div>
  )
}

type HeadingDropdownProps = {
  heading: Heading
  allHeadings: Heading[]
  onSelect: (heading: Heading) => void
}

function HeadingDropdown({ heading, allHeadings, onSelect }: HeadingDropdownProps) {
  // Show siblings: headings at the same level that share the same parent
  const siblings = React.useMemo(() => {
    return getSiblings(allHeadings, heading)
  }, [allHeadings, heading])

  return (
    <Menu.Root>
      <Menu.Trigger className="min-w-0 max-w-[200px] cursor-pointer truncate rounded-sm px-1 py-0.5 text-text-secondary hover:bg-bg-hover hover:text-text active:bg-bg-active">
        {heading.text}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" sideOffset={4} align="start">
          <Menu.Popup
            className={cx(
              "card-2 z-20 grid place-items-stretch overflow-hidden rounded-lg outline-hidden",
              "origin-[var(--transform-origin)] transition-[transform,scale,opacity] epaper:transition-none data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
            )}
            style={{ width: 280 }}
          >
            <div className="grid max-h-[60svh] scroll-py-1 overflow-auto p-1">
              {siblings.map((h) => (
                <Menu.Item
                  key={h.index}
                  className={cx(
                    "flex h-8 cursor-pointer select-none items-center gap-2 truncate rounded px-3 outline-hidden focus:bg-bg-hover focus:outline-hidden active:bg-bg-active coarse:h-10",
                    h.index === heading.index && "font-medium text-text",
                    h.index !== heading.index && "text-text-secondary",
                  )}
                  onClick={() => onSelect(h)}
                >
                  <span className="truncate">{h.text}</span>
                </Menu.Item>
              ))}
            </div>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}

/** Get sibling headings (same level under the same parent). */
function getSiblings(headings: Heading[], target: Heading): Heading[] {
  const targetIdx = headings.findIndex((h) => h.index === target.index)
  if (targetIdx === -1) return [target]

  const level = target.level
  const siblings: Heading[] = []

  // Find the parent (first heading with lower level before target)
  let parentIdx = -1
  for (let i = targetIdx - 1; i >= 0; i--) {
    if (headings[i].level < level) {
      parentIdx = i
      break
    }
  }

  // Collect all headings at the same level between the parent and the next parent-level heading
  const startIdx = parentIdx + 1
  for (let i = startIdx; i < headings.length; i++) {
    if (headings[i].level < level) break
    if (headings[i].level === level) {
      siblings.push(headings[i])
    }
  }

  return siblings.length > 0 ? siblings : [target]
}
