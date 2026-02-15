import mermaid from "mermaid"
import React from "react"

mermaid.initialize({
  startOnLoad: false,
  theme: "default",
  securityLevel: "strict",
})

type MermaidDiagramProps = {
  children: string
}

export function MermaidDiagram({ children }: MermaidDiagramProps) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const [svg, setSvg] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    const id = `mermaid-${Math.random().toString(36).slice(2, 11)}`

    async function render() {
      try {
        const { svg } = await mermaid.render(id, children.trim())
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
    return null
  }

  return (
    <div ref={containerRef} className="mermaid-diagram" dangerouslySetInnerHTML={{ __html: svg }} />
  )
}
