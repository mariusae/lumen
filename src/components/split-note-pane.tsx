import { useNavigate } from "@tanstack/react-router"
import { ReactCodeMirrorRef } from "@uiw/react-codemirror"
import { useAtomValue } from "jotai"
import React from "react"
import { githubRepoAtom, isSignedOutAtom } from "../global-state"
import { useActiveHeading } from "../hooks/active-heading"
import { useEditorValue } from "../hooks/editor-value"
import { useNoteById, useSaveNote } from "../hooks/note"
import { NoteId } from "../schema"
import { clearNoteDraft } from "../utils/note-draft"
import { parseNote } from "../utils/parse-note"
import { Button } from "./button"
import { DraftIndicator } from "./draft-indicator"
import { DropdownMenu } from "./dropdown-menu"
import { HeadingNav } from "./heading-nav"
import { IconButton } from "./icon-button"
import { HoverCard } from "./hover-card"
import { MaximizeIcon16, UndoIcon16, XIcon16 } from "./icons"
import { Markdown } from "./markdown"
import { NoteEditor } from "./note-editor"
import { NoteFavicon } from "./note-favicon"
import { SegmentedControl } from "./segmented-control"

type SplitNotePaneProps = {
  noteId: NoteId
  onClose: () => void
  onNavigate: (noteId: NoteId) => void
}

export function SplitNotePane({ noteId, onClose, onNavigate }: SplitNotePaneProps) {
  const navigate = useNavigate()
  const isSignedOut = useAtomValue(isSignedOutAtom)
  const githubRepo = useAtomValue(githubRepoAtom)
  const note = useNoteById(noteId)
  const saveNote = useSaveNote()
  const editorRef = React.useRef<ReactCodeMirrorRef>(null)

  const { editorValue, setEditorValue, isDraft, discardChanges } = useEditorValue({
    noteId,
    note,
    defaultValue: "",
  })

  const [mode, setMode] = React.useState<"read" | "write">("read")

  const [scrollContainer, setScrollContainer] = React.useState<HTMLDivElement | null>(null)

  const parsedNote = React.useMemo(() => parseNote(noteId, editorValue), [noteId, editorValue])

  const { headings, activeHeadingIndex, scrollToHeading } = useActiveHeading(
    scrollContainer,
    editorValue,
    mode,
  )

  const handleSave = React.useCallback(
    (value: string) => {
      if (isSignedOut) return
      if (!note && !value) return
      if (value !== note?.content) {
        saveNote({ id: noteId, content: value })
      }
      clearNoteDraft({ githubRepo, noteId })
    },
    [isSignedOut, note, saveNote, noteId, githubRepo],
  )

  const switchToWriting = React.useCallback(() => {
    setMode("write")
    setTimeout(() => editorRef.current?.view?.focus())
  }, [])

  const switchToReading = React.useCallback(() => {
    setMode("read")
  }, [])

  const handleMaximize = React.useCallback(() => {
    navigate({
      to: "/notes/$",
      params: { _splat: noteId },
      search: { mode, query: undefined, view: "grid" },
    })
    onClose()
  }, [navigate, noteId, mode, onClose])

  // Intercept link clicks in markdown to navigate within the split pane
  const handleLinkClick = React.useCallback(
    (event: React.MouseEvent) => {
      const anchor = (event.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null
      if (!anchor) return

      const href = anchor.getAttribute("href")
      if (!href || !href.startsWith("/notes/")) return

      event.preventDefault()
      const targetNoteId = decodeURIComponent(href.replace("/notes/", ""))
      onNavigate(targetNoteId)
    },
    [onNavigate],
  )

  // Scoped keyboard shortcuts — stop propagation so the main view's handlers don't fire
  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey

      if (mod && event.key === "s") {
        event.preventDefault()
        event.stopPropagation()
        handleSave(editorValue)
      }

      if (mod && event.key === "e") {
        event.preventDefault()
        event.stopPropagation()
        if (mode === "read") {
          switchToWriting()
        } else {
          switchToReading()
        }
      }

      if (mod && event.key === "Enter") {
        event.preventDefault()
        event.stopPropagation()
        handleSave(editorValue)
        switchToReading()
      }
    },
    [handleSave, editorValue, mode, switchToWriting, switchToReading],
  )

  return (
    <HoverCard.Provider>
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div className="flex h-full flex-col overflow-hidden" onKeyDownCapture={handleKeyDown}>
        {/* Header */}
        <div className="flex items-center gap-1 border-b border-border-secondary px-3 py-1.5">
          <div className="mr-auto flex min-w-0 items-center gap-1.5">
            <span className="shrink-0 text-text-secondary">
              <NoteFavicon note={parsedNote} />
            </span>
            <span className="truncate text-sm font-medium">
              {headings.length > 0 && activeHeadingIndex >= 0 ? (
                <HeadingNav
                  noteId={`${noteId}.md`}
                  headings={headings}
                  activeHeadingIndex={activeHeadingIndex}
                  onSelectHeading={scrollToHeading}
                />
              ) : (
                <>{noteId}.md</>
              )}
            </span>
            {isDraft ? (
              <DropdownMenu modal={false}>
                <DropdownMenu.Trigger
                  render={
                    <IconButton aria-label="Unsaved changes" size="small" className="px-1">
                      <DraftIndicator />
                    </IconButton>
                  }
                />
                <DropdownMenu.Content>
                  <DropdownMenu.Item
                    icon={<UndoIcon16 />}
                    variant="danger"
                    onClick={() => {
                      discardChanges()
                      editorRef.current?.view?.focus()
                    }}
                  >
                    Discard changes
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu>
            ) : null}
          </div>
          {(!note && editorValue) || isDraft ? (
            <Button
              disabled={isSignedOut}
              variant="primary"
              size="small"
              shortcut={["⌘", "S"]}
              onClick={() => handleSave(editorValue)}
            >
              Save
            </Button>
          ) : null}
          <SegmentedControl aria-label="Mode" size="small">
            <SegmentedControl.Segment selected={mode === "read"} onClick={switchToReading}>
              View
            </SegmentedControl.Segment>
            <SegmentedControl.Segment selected={mode === "write"} onClick={switchToWriting}>
              Edit
            </SegmentedControl.Segment>
          </SegmentedControl>
          <IconButton aria-label="Open in main view" size="small" onClick={handleMaximize}>
            <MaximizeIcon16 />
          </IconButton>
          <IconButton aria-label="Close split view" size="small" onClick={onClose}>
            <XIcon16 />
          </IconButton>
        </div>

        {/* Content */}
        <div ref={setScrollContainer} className="@container min-h-0 flex-1 overflow-auto">
          <div className="p-5 @[640px]:p-10">
            <div className="mx-auto flex max-w-[700px] flex-col gap-8">
              {mode === "read" && (
                // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
                <div
                  className="min-h-[240px]"
                  onClick={handleLinkClick}
                  onMouseDown={(event) => {
                    // Double click to edit
                    if (event.detail > 1) {
                      event.preventDefault()
                      switchToWriting()
                    }
                  }}
                >
                  <Markdown
                    noteId={noteId}
                    onChange={setEditorValue}
                    emptyText={
                      <>
                        Empty note (double <span className="coarse:hidden">click</span>
                        <span className="hidden coarse:inline">tap</span> to edit)
                      </>
                    }
                  >
                    {editorValue}
                  </Markdown>
                </div>
              )}
              <div hidden={mode !== "write"} className="min-h-[240px]">
                <NoteEditor
                  ref={editorRef}
                  defaultValue={editorValue}
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus
                  onChange={setEditorValue}
                  onNavigate={onNavigate}
                  minHeight={160}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </HoverCard.Provider>
  )
}
