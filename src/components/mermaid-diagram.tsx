import mermaid from "mermaid"
import React from "react"

mermaid.initialize({
  startOnLoad: false,
  theme: "default",
  securityLevel: "strict",
})

// Hidden container where mermaid renders temporary elements during SVG generation.
// Placed offscreen so the intermediate DOM work is never visible to the user.
let offscreenContainer: HTMLDivElement | null = null
function getOffscreenContainer() {
  if (!offscreenContainer) {
    offscreenContainer = document.createElement("div")
    offscreenContainer.style.position = "absolute"
    offscreenContainer.style.left = "-9999px"
    offscreenContainer.style.top = "-9999px"
    offscreenContainer.setAttribute("aria-hidden", "true")
    document.body.appendChild(offscreenContainer)
  }
  return offscreenContainer
}

type MermaidDiagramProps = {
  children: string
}

export function MermaidDiagram({ children }: MermaidDiagramProps) {
  const [svg, setSvg] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    const id = `mermaid-${Math.random().toString(36).slice(2, 11)}`

    async function render() {
      try {
        const { svg } = await mermaid.render(id, children.trim(), getOffscreenContainer())
        if (!cancelled) {
          setSvg(svg)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to render diagram")
          setSvg(null)
        }
        // Clean up any leftover element from failed render
        document.getElementById("d" + id)?.remove()
      }
    }

    render()
    return () => {
      cancelled = true
    }
  }, [children])

  if (error) {
    return (
      <div className="mermaid-error">
        <pre>
          <code>{children}</code>
        </pre>
        <p className="text-red-500 text-sm mt-2">{error}</p>
      </div>
    )
  }

  if (!svg) {
    return (
      <div className="mermaid-diagram">
        <pre>
          <code>{children}</code>
        </pre>
      </div>
    )
  }

  return <div className="mermaid-diagram" dangerouslySetInnerHTML={{ __html: svg }} />
}
