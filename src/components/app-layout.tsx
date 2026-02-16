import { useAtom, useAtomValue } from "jotai"
import React from "react"
import { useHotkeys } from "react-hotkeys-hook"
import { Group, Panel, Separator, useDefaultLayout } from "react-resizable-panels"
import { useMedia } from "react-use"
import { isHelpPanelOpenAtom, sidebarAtom } from "../global-state"
import { cx } from "../utils/cx"
import { HelpDrawer, HelpSidebar } from "./help-panel"
import { NavBar } from "./nav-bar"
import { Sidebar } from "./sidebar"
import { SignInBanner } from "./sign-in-banner"
import { SplitNotePane } from "./split-note-pane"

type AppLayoutProps = {
  className?: string
  children?: React.ReactNode
}

type SplitViewContextValue = {
  openSplitView: (href: string) => boolean
  closeSplitView: () => void
}

const SplitViewContext = React.createContext<SplitViewContextValue | null>(null)

export function useSplitView() {
  return React.useContext(SplitViewContext)
}

export function AppLayout({ className, children }: AppLayoutProps) {
  const sidebar = useAtomValue(sidebarAtom)
  const [isHelpPanelOpen, setHelpPanel] = useAtom(isHelpPanelOpenAtom)
  const isWideViewport = useMedia("(min-width: 1024px)")
  const showHelpSidebar = isHelpPanelOpen && isWideViewport

  const [splitViewNoteId, setSplitViewNoteId] = React.useState<string | null>(null)
  const [splitViewWidth, setSplitViewWidth] = React.useState(40)
  const splitContainerRef = React.useRef<HTMLDivElement>(null)
  const mainContentRef = React.useRef<HTMLDivElement>(null)
  const splitPaneRef = React.useRef<HTMLDivElement>(null)
  const separatorRef = React.useRef<HTMLDivElement>(null)
  const splitViewWidthRef = React.useRef(40)
  const stopResizeRef = React.useRef<(() => void) | null>(null)

  // Keep the ref in sync when state changes (e.g., on open/close)
  splitViewWidthRef.current = splitViewWidth

  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "app-layout",
    panelIds: showHelpSidebar ? ["content", "help"] : ["content"],
    storage: window.localStorage,
  })

  useHotkeys(
    "mod+/",
    () => {
      setHelpPanel((prev) => !prev)
    },
    {
      preventDefault: true,
      enableOnFormTags: true,
      enableOnContentEditable: true,
    },
  )

  const openSplitView = React.useCallback(
    (href: string) => {
      if (!isWideViewport) return false

      const url = new URL(href, window.location.href)
      if (url.origin !== window.location.origin) return false
      if (!url.pathname.startsWith("/notes/")) return false

      const noteId = decodeURIComponent(url.pathname.replace("/notes/", ""))
      setSplitViewNoteId(noteId)
      return true
    },
    [isWideViewport],
  )

  const closeSplitView = React.useCallback(() => {
    setSplitViewNoteId(null)
  }, [])

  const handleModifierClick = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!(event.metaKey || event.ctrlKey) || event.button !== 0) return

      const anchor = (event.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null
      if (!anchor || anchor.dataset.noSplitView === "true") return

      const url = new URL(anchor.href, window.location.href)
      if (url.origin !== window.location.origin || url.hash) return

      if (openSplitView(url.href)) {
        event.preventDefault()
        event.stopPropagation()
      }
    },
    [openSplitView],
  )

  const startResize = React.useCallback((event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault()

    // Use data attribute to trigger CSS cursor and pointer-events rules
    separatorRef.current?.setAttribute("data-resizing", "true")

    const handleMouseMove = (mouseEvent: MouseEvent) => {
      if (!splitContainerRef.current) return
      const rect = splitContainerRef.current.getBoundingClientRect()
      const nextWidth = Math.min(
        70,
        Math.max(25, ((rect.right - mouseEvent.clientX) / rect.width) * 100),
      )
      splitViewWidthRef.current = nextWidth
      // Update DOM directly to avoid React re-renders during drag
      if (mainContentRef.current) {
        mainContentRef.current.style.width = `${100 - nextWidth}%`
      }
      if (splitPaneRef.current) {
        splitPaneRef.current.style.width = `${nextWidth}%`
      }
    }

    const stopResize = () => {
      separatorRef.current?.removeAttribute("data-resizing")
      // Sync final width to React state
      setSplitViewWidth(splitViewWidthRef.current)
      window.removeEventListener("mousemove", handleMouseMove, true)
      window.removeEventListener("mouseup", stopResize, true)
      window.removeEventListener("blur", stopResize)
      stopResizeRef.current = null
    }

    stopResizeRef.current = stopResize
    window.addEventListener("mousemove", handleMouseMove, true)
    window.addEventListener("mouseup", stopResize, true)
    window.addEventListener("blur", stopResize)
  }, [])

  React.useEffect(() => {
    return () => {
      stopResizeRef.current?.()
    }
  }, [])

  const isSplitViewOpen = Boolean(splitViewNoteId && isWideViewport)

  const splitViewContext = React.useMemo(
    () => ({ openSplitView, closeSplitView }),
    [openSplitView, closeSplitView],
  )

  return (
    <SplitViewContext.Provider value={splitViewContext}>
      <div className={cx("flex grow flex-col overflow-hidden print:overflow-visible", className)}>
        <div className="flex grow overflow-hidden" onClickCapture={handleModifierClick}>
          {sidebar === "expanded" ? (
            <div className="hidden w-56 shrink-0 sm:grid print:hidden">
              <Sidebar />
            </div>
          ) : null}
          <Group
            orientation="horizontal"
            className="grow overflow-hidden"
            defaultLayout={defaultLayout}
            onLayoutChanged={onLayoutChanged}
          >
            <Panel id="content" className="overflow-hidden">
              <div className="grid h-full grid-rows-[1fr_auto] overflow-hidden">
                <div ref={splitContainerRef} className="flex min-h-0 grow overflow-hidden">
                  <div
                    ref={mainContentRef}
                    className="grid min-h-0 min-w-0 overflow-hidden"
                    style={{ width: isSplitViewOpen ? `${100 - splitViewWidth}%` : "100%" }}
                  >
                    {children}
                  </div>
                  {isSplitViewOpen && splitViewNoteId ? (
                    <>
                      <div
                        ref={separatorRef}
                        role="separator"
                        aria-orientation="vertical"
                        className="relative hidden w-px shrink-0 print:hidden lg:block"
                      >
                        <button
                          type="button"
                          aria-label="Resize split view"
                          className="absolute inset-y-0 -left-1.5 -right-1.5 z-10 cursor-col-resize"
                          onMouseDown={startResize}
                        />
                      </div>
                      <div
                        ref={splitPaneRef}
                        className="relative hidden min-h-0 min-w-0 shrink-0 shadow-[-6px_0_16px_-8px_rgba(0,0,0,0.12)] print:hidden lg:block"
                        style={{ width: `${splitViewWidth}%` }}
                      >
                        <SplitNotePane
                          key={splitViewNoteId}
                          noteId={splitViewNoteId}
                          onClose={closeSplitView}
                          onNavigate={setSplitViewNoteId}
                        />
                      </div>
                    </>
                  ) : null}
                </div>
                <div className="sm:hidden print:hidden">
                  <NavBar />
                </div>
              </div>
            </Panel>
            {showHelpSidebar ? (
              <>
                <Separator className="relative w-px bg-border-secondary print:hidden outline-none">
                  <div className="absolute inset-y-0 -left-1.5 -right-1.5 z-10" />
                </Separator>
                <Panel
                  id="help"
                  className="print:hidden"
                  defaultSize="30%"
                  minSize="25%"
                  maxSize="40%"
                >
                  <HelpSidebar />
                </Panel>
              </>
            ) : null}
          </Group>
          {!isWideViewport ? <HelpDrawer /> : null}
        </div>
        <SignInBanner className="hidden sm:flex border-t border-border-secondary" />
      </div>
    </SplitViewContext.Provider>
  )
}
