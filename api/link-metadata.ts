/**
 * Fetches a URL and extracts the page title and Open Graph metadata.
 * The URL should be provided as a query parameter, e.g. /link-metadata?url=https://example.com
 */
async function handler(request: Request): Promise<Response> {
  try {
    const url = getRequestUrl(request)
    const targetUrl = url.searchParams.get("url")

    if (!targetUrl) {
      return new Response(JSON.stringify({ error: "Missing 'url' query parameter" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      })
    }

    const response = await fetch(targetUrl, {
      headers: {
        // Use a browser-like user-agent to avoid being blocked
        "User-Agent": "Mozilla/5.0 (compatible; Lumen/1.0; +https://github.com/lumen-notes/lumen)",
        Accept: "text/html",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(5000),
    })

    if (!response.ok) {
      return new Response(JSON.stringify({ error: `Failed to fetch: ${response.statusText}` }), {
        status: 502,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      })
    }

    // Read only the first chunk of the response to find metadata
    // This avoids downloading the entire page
    const reader = response.body?.getReader()
    const decoder = new TextDecoder()
    let html = ""
    const maxBytes = 50_000 // Read up to 50KB, enough to find <head> metadata

    if (reader) {
      while (html.length < maxBytes) {
        const { done, value } = await reader.read()
        if (done) break
        html += decoder.decode(value, { stream: true })
        // Stop early if we've found the closing </head> tag
        if (/<\/head>/i.test(html)) break
      }
      reader.cancel()
    }

    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    const title = titleMatch ? decodeHtmlEntities(titleMatch[1].trim()) : null

    // Extract Open Graph metadata
    const ogTitle = extractMetaContent(html, "og:title")
    const ogDescription =
      extractMetaContent(html, "og:description") ?? extractMetaContent(html, "description")
    const ogImageRaw = extractMetaContent(html, "og:image")
    // Resolve relative og:image URLs against the target URL
    const ogImage = ogImageRaw ? resolveUrl(ogImageRaw, targetUrl) : null
    const ogSiteName = extractMetaContent(html, "og:site_name")

    return new Response(
      JSON.stringify({
        title,
        og: {
          title: ogTitle,
          description: ogDescription,
          image: ogImage,
          siteName: ogSiteName,
        },
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=86400",
          "Access-Control-Allow-Origin": "*",
        },
      },
    )
  } catch (error) {
    console.error(error)
    const message = error instanceof Error ? error.message : "Unknown error"
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    })
  }
}

export const GET = handler

function getRequestUrl(request: Request): URL {
  try {
    return new URL(request.url)
  } catch {
    const host = request.headers.get("host") ?? "localhost"
    const proto = request.headers.get("x-forwarded-proto") ?? "http"
    return new URL(request.url, `${proto}://${host}`)
  }
}

/**
 * Resolves a potentially relative URL against a base URL.
 * Returns the original string if it's already absolute or if resolution fails.
 */
function resolveUrl(url: string, base: string): string {
  try {
    return new URL(url, base).href
  } catch {
    return url
  }
}

/**
 * Extracts the content attribute from a meta tag by property or name.
 * Handles both `property="og:..."` and `name="description"` patterns.
 */
function extractMetaContent(html: string, property: string): string | null {
  // Match <meta property="..." content="..."> or <meta name="..." content="...">
  // Also handle reversed attribute order: <meta content="..." property="...">
  const escapedProp = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escapedProp}["'][^>]+content=["']([^"']*?)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*?)["'][^>]+(?:property|name)=["']${escapedProp}["']`,
      "i",
    ),
  ]

  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match) {
      return decodeHtmlEntities(match[1].trim()) || null
    }
  }

  return null
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
}
