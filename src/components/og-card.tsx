import React from "react"
import { cx } from "../utils/cx"
import { WebsiteFavicon } from "./website-favicon"

type OgMetadata = {
  title: string | null
  description: string | null
  image: string | null
  siteName: string | null
}

function useOgMetadata(url: string) {
  const [data, setData] = React.useState<OgMetadata | null>(null)

  React.useEffect(() => {
    const controller = new AbortController()

    fetch(`/api/link-metadata?url=${encodeURIComponent(url)}`, {
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((json) => {
        const result = json as { og?: OgMetadata }
        if (result.og) {
          setData(result.og)
        }
      })
      .catch(() => {
        // Ignore fetch errors (abort, network, etc.)
      })

    return () => controller.abort()
  }, [url])

  return data
}

export function OpenGraphCard({
  url,
  fallbackTitle,
  className,
}: {
  url: string
  fallbackTitle?: string
  className?: string
}) {
  const og = useOgMetadata(url)

  let hostname: string
  try {
    hostname = new URL(url).hostname.replace(/^www\./, "")
  } catch {
    hostname = url
  }

  // Show fallback while loading or if OG data has no meaningful content
  if (!og || (!og.title && !og.description && !og.image)) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={cx(
          "flex items-center gap-2 overflow-hidden rounded-lg border border-border bg-bg-card p-3 no-underline!",
          className,
        )}
      >
        <WebsiteFavicon url={url} size={16} />
        <span className="truncate text-sm text-text-primary">{fallbackTitle || hostname}</span>
      </a>
    )
  }

  const hasImage = !!og.image

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cx(
        "group/og-card flex overflow-hidden rounded-lg border border-border bg-bg-card no-underline!",
        hasImage ? "flex-col @[28rem]:flex-row" : "flex-row",
        className,
      )}
    >
      {hasImage ? (
        <div
          className={cx(
            "shrink-0 bg-bg-tertiary",
            "h-[160px] w-full @[28rem]:h-auto @[28rem]:w-[200px]",
          )}
        >
          <img
            src={`/api/file-proxy?url=${encodeURIComponent(og.image!)}`}
            alt=""
            className="size-full object-cover"
          />
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 p-3">
        <div className="flex items-center gap-1.5 text-xs text-text-secondary">
          <WebsiteFavicon url={url} size={16} />
          <span className="truncate">{og.siteName || hostname}</span>
        </div>
        {og.title ? (
          <div className="line-clamp-2 text-sm font-semibold leading-snug text-text-primary">
            {og.title}
          </div>
        ) : null}
        {og.description ? (
          <div className="line-clamp-2 text-xs leading-relaxed text-text-secondary">
            {og.description}
          </div>
        ) : null}
      </div>
    </a>
  )
}
