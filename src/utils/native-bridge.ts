/**
 * Adapter for the native iOS bridge (window.LumenNative).
 *
 * The native app injects bridge.js at document start, which creates
 * window.LumenNative. This module provides typed access and no-ops
 * when running in a regular browser.
 */

interface LumenNativeAPI {
  isNative: boolean
  platform: "ios"
  saveState(url: string): void
  getState(): Promise<string | null>
  haptic(style: "light" | "medium" | "heavy" | "selection" | "success" | "warning" | "error"): void
  registerForNotifications(): Promise<string | null>
  beginBackgroundSync(): void
  getSharedItems(): Promise<Array<{ type: string; value: string; timestamp: number }>>
  clearSharedItems(): void
  onSharedItems(
    callback: (items: Array<{ type: string; value: string; timestamp: number }>) => void,
  ): void
  setPersistentValue(key: string, value: string): void
  getPersistentValue(key: string): Promise<string | null>
  log(message: string): void
  _navigateTo(url: string): void
  _onSharedItems(items: unknown): void
  _resolveCallback(id: string, result: unknown): void
}

declare global {
  interface Window {
    LumenNative?: LumenNativeAPI
  }
}

/** Whether we're running inside the native iOS app. */
export const isNativeApp = typeof window !== "undefined" && !!window.LumenNative

/** Get the native bridge, or null if not in the native app. */
export function getNativeBridge(): LumenNativeAPI | null {
  return window.LumenNative ?? null
}

/**
 * Save the current URL for native state restoration.
 * Falls back to the PWA localStorage approach when not native.
 */
export function nativeSaveState(url: string) {
  window.LumenNative?.saveState(url)
}

/** Trigger native haptic feedback. No-op in browser. */
export function nativeHaptic(
  style: "light" | "medium" | "heavy" | "selection" | "success" | "warning" | "error" = "medium",
) {
  window.LumenNative?.haptic(style)
}

/** Tell the native app to begin a background task for syncing. */
export function nativeBeginBackgroundSync() {
  window.LumenNative?.beginBackgroundSync()
}
