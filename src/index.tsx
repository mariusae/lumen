import { Tooltip } from "@base-ui/react/tooltip"
import { RouterProvider, createRouter } from "@tanstack/react-router"
import "@total-typescript/ts-reset"
import { StrictMode } from "react"
import ReactDOM from "react-dom/client"
import { routeTree } from "./routeTree.gen"
import "./styles/index.css"
import { getSessionUrl } from "./utils/session-state"

// Restore the last visited URL before the router initializes.
// This handles the case where iOS kills the PWA process in the background
// and the user reopens it — they'll be taken back to where they were.
const savedUrl = getSessionUrl()
if (savedUrl && savedUrl !== "/" && window.location.pathname === "/") {
  window.history.replaceState(null, "", savedUrl)
}

// Create a new router instance
const router = createRouter({ routeTree, scrollRestoration: true })

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}

// Lazy-load non-default fonts. The default font (iA Writer Quattro/Mono) is loaded
// via CSS @font-face in fonts.css and cached by the service worker. The serif,
// handwriting, and alternative mono fonts are only needed if the user has changed
// their font preference, so we defer them to avoid blocking the initial render.
function loadOptionalFonts() {
  import("./utils/optional-fonts")
}

if ("requestIdleCallback" in window) {
  requestIdleCallback(loadOptionalFonts)
} else {
  setTimeout(loadOptionalFonts, 200)
}

// Render the app
const rootElement = document.getElementById("root")!
const root = ReactDOM.createRoot(rootElement)
root.render(
  <StrictMode>
    <Tooltip.Provider delay={200}>
      <RouterProvider router={router} />
    </Tooltip.Provider>
  </StrictMode>,
)
