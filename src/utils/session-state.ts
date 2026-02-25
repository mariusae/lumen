const SESSION_URL_KEY = "session_url" as const

/** Save the current URL so we can restore it when iOS kills and restarts the PWA */
export function saveSessionUrl() {
  try {
    const url = window.location.pathname + window.location.search
    localStorage.setItem(SESSION_URL_KEY, url)
  } catch {
    // Ignore storage errors
  }
}

/** Get the saved session URL, if any */
export function getSessionUrl(): string | null {
  try {
    return localStorage.getItem(SESSION_URL_KEY)
  } catch {
    return null
  }
}

/** Clear the saved session URL (e.g., on sign out) */
export function clearSessionUrl() {
  try {
    localStorage.removeItem(SESSION_URL_KEY)
  } catch {
    // Ignore storage errors
  }
}
