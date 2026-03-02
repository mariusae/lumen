import { Link, createFileRoute } from "@tanstack/react-router"
import { useAtomValue } from "jotai"
import React, { useCallback, useEffect, useRef, useState } from "react"
import { TimelineIcon16 } from "../components/icons"
import { MarkdownContent } from "../components/markdown"
import { PageLayout } from "../components/page-layout"
import { githubUserAtom } from "../global-state"
import { gitFetchFullHistory } from "../utils/git"
import {
  DayEntry,
  DayGroup,
  computeDayChanges,
  getCommitLog,
  groupCommitsByDay,
} from "../utils/timeline"

export const Route = createFileRoute("/_appRoot/timeline")({
  component: TimelinePage,
  head: () => ({
    meta: [{ title: "Timeline · Lumen" }],
  }),
})

const DAYS_PER_BATCH = 7

function TimelinePage() {
  const githubUser = useAtomValue(githubUserAtom)
  const [dayGroups, setDayGroups] = useState<DayGroup[]>([])
  const [dayEntries, setDayEntries] = useState<DayEntry[]>([])
  const [loadedIndex, setLoadedIndex] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [isInitializing, setIsInitializing] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLElement>(null)

  // Initialize: fetch full history, then load the commit log and group by day
  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        // Fetch full history (unshallow the depth=1 clone)
        if (githubUser) {
          await gitFetchFullHistory(githubUser)
        }

        const commits = await getCommitLog()
        if (cancelled) return
        const groups = groupCommitsByDay(commits)
        setDayGroups(groups)
        setIsInitializing(false)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Failed to load timeline")
        setIsInitializing(false)
      }
    }

    init()
    return () => {
      cancelled = true
    }
  }, [githubUser])

  // Load more days
  const loadMore = useCallback(async () => {
    if (isLoading || loadedIndex >= dayGroups.length) return

    setIsLoading(true)
    try {
      const end = Math.min(loadedIndex + DAYS_PER_BATCH, dayGroups.length)
      const batch = dayGroups.slice(loadedIndex, end)

      const entries: DayEntry[] = []
      for (const group of batch) {
        const entry = await computeDayChanges(group)
        // Only include days that have actual file changes
        if (entry.files.length > 0) {
          entries.push(entry)
        }
      }

      setDayEntries((prev) => [...prev, ...entries])
      setLoadedIndex(end)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load timeline entries")
    } finally {
      setIsLoading(false)
    }
  }, [isLoading, loadedIndex, dayGroups])

  // Load first batch once day groups are available
  useEffect(() => {
    if (dayGroups.length > 0 && loadedIndex === 0) {
      loadMore()
    }
  }, [dayGroups, loadedIndex, loadMore])

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    const sentinel = sentinelRef.current
    const scrollContainer = scrollRef.current
    if (!sentinel || !scrollContainer) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore()
        }
      },
      {
        root: scrollContainer,
        rootMargin: "400px",
      },
    )

    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [loadMore])

  const hasMore = loadedIndex < dayGroups.length

  return (
    <PageLayout title="Timeline" icon={<TimelineIcon16 />} scrollRef={scrollRef}>
      <div className="flex flex-col gap-0 px-4 pt-0 pb-[50vh]">
        {error ? (
          <div className="py-8 text-center text-text-danger">{error}</div>
        ) : isInitializing ? (
          <div className="py-8 text-center text-text-secondary">Loading timeline…</div>
        ) : dayEntries.length === 0 && !hasMore ? (
          <div className="py-8 text-center text-text-secondary">No changes found</div>
        ) : (
          <>
            {dayEntries.map((entry) => (
              <DaySection key={entry.date} entry={entry} />
            ))}
            {isLoading ? (
              <div className="py-4 text-center text-text-secondary">Loading…</div>
            ) : null}
            {hasMore ? <div ref={sentinelRef} className="h-1" /> : null}
            {!hasMore && dayEntries.length > 0 ? (
              <div className="py-8 text-center text-sm text-text-tertiary">End of timeline</div>
            ) : null}
          </>
        )}
      </div>
    </PageLayout>
  )
}

function formatDayHeader(dateStr: string): string {
  const date = new Date(dateStr + "T12:00:00")
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`

  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ]

  const formatted = `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`

  if (dateStr === today) return `Today — ${formatted}`
  if (dateStr === yesterdayStr) return `Yesterday — ${formatted}`
  return formatted
}

function DaySection({ entry }: { entry: DayEntry }) {
  return (
    <section className="flex flex-col gap-3 py-4 first:pt-0">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-text-secondary">
        <span className="h-px flex-1 bg-border" />
        <span className="shrink-0">{formatDayHeader(entry.date)}</span>
        <span className="h-px flex-1 bg-border" />
      </h2>
      <div className="flex flex-col gap-4">
        {entry.files.map((file) => (
          <FileSection key={file.filepath} file={file} />
        ))}
      </div>
    </section>
  )
}

function FileSection({
  file,
}: {
  file: { filepath: string; title: string; paragraphs: string[] }
}) {
  const noteId = file.filepath.replace(/\.md$/, "")

  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="font-bold">
        <Link
          to="/notes/$"
          params={{ _splat: noteId }}
          search={{ mode: "read", query: undefined, view: "grid" }}
          className="hover:underline"
        >
          {file.title}
        </Link>
      </h3>
      <div className="flex flex-col gap-2 pl-3 border-l-2 border-border">
        {file.paragraphs.map((paragraph, i) => (
          <div key={i} className="text-sm text-text-secondary">
            <MarkdownContent>{paragraph}</MarkdownContent>
          </div>
        ))}
      </div>
    </div>
  )
}
