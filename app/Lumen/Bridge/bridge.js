/**
 * Native bridge for Lumen iOS app.
 *
 * Injected at document start by WKWebView. Creates the `window.LumenNative` API
 * that the web app can use to access native capabilities. The web app should check
 * `if (window.LumenNative)` before calling any methods.
 *
 * Communication flow:
 *   JS  →  window.webkit.messageHandlers.<name>.postMessage(payload)  →  Swift
 *   Swift  →  window.LumenNative._resolveCallback(id, result)        →  JS
 */
;(function () {
  "use strict"

  // Pending promise callbacks keyed by unique ID
  const pendingCallbacks = new Map()
  let callbackCounter = 0

  function post(name, payload) {
    window.webkit.messageHandlers[name].postMessage(payload)
  }

  function postWithCallback(name, payload) {
    const id = String(++callbackCounter)
    return new Promise((resolve) => {
      pendingCallbacks.set(id, resolve)
      // If payload is undefined, send the callback ID directly.
      // Otherwise merge it with the callback ID.
      if (payload === undefined) {
        post(name, id)
      } else if (typeof payload === "object" && payload !== null) {
        post(name, { ...payload, callbackId: id })
      } else {
        post(name, id)
      }
    })
  }

  // Shared items callback (called from native on page load)
  let sharedItemsCallback = null

  window.LumenNative = {
    /** true when running inside the native iOS app */
    isNative: true,

    /** The platform: "ios" */
    platform: "ios",

    // ──────────────────────────────────────────────
    // State Restoration
    // ──────────────────────────────────────────────

    /** Save the current URL path for state restoration */
    saveState(url) {
      post("saveState", url)
    },

    /** Get the previously saved URL path */
    async getState() {
      return postWithCallback("getState")
    },

    // ──────────────────────────────────────────────
    // Haptic Feedback
    // ──────────────────────────────────────────────

    /** Trigger haptic feedback.
     *  @param {"light"|"medium"|"heavy"|"selection"|"success"|"warning"|"error"} style */
    haptic(style) {
      post("haptic", style || "medium")
    },

    // ──────────────────────────────────────────────
    // Push Notifications
    // ──────────────────────────────────────────────

    /** Register for push notifications. Returns the device token or null. */
    async registerForNotifications() {
      return postWithCallback("registerNotifications")
    },

    // ──────────────────────────────────────────────
    // Background Sync
    // ──────────────────────────────────────────────

    /** Tell the native app to begin a background task (call when going to background).
     *  This gives the web app ~30s to finish syncing before iOS suspends it. */
    beginBackgroundSync() {
      post("beginBackgroundSync", "")
    },

    // ──────────────────────────────────────────────
    // Share Extension
    // ──────────────────────────────────────────────

    /** Get items shared via the iOS share extension. Returns an array. */
    async getSharedItems() {
      return postWithCallback("getSharedItems")
    },

    /** Clear pending shared items after processing. */
    clearSharedItems() {
      post("clearSharedItems", "")
    },

    /** Register a callback for when shared items arrive. */
    onSharedItems(callback) {
      sharedItemsCallback = callback
    },

    // ──────────────────────────────────────────────
    // Persistent Storage (survives app reinstall if backed up)
    // ──────────────────────────────────────────────

    /** Write a value to native persistent storage (UserDefaults in app group). */
    setPersistentValue(key, value) {
      post("setPersistentValue", { key, value })
    },

    /** Read a value from native persistent storage. */
    async getPersistentValue(key) {
      return postWithCallback("getPersistentValue", { key })
    },

    // ──────────────────────────────────────────────
    // Logging
    // ──────────────────────────────────────────────

    /** Log a message to the native console (visible in Xcode). */
    log(message) {
      post("log", String(message))
    },

    // ──────────────────────────────────────────────
    // Internal (called from Swift, not for app use)
    // ──────────────────────────────────────────────

    /** @internal Resolve a pending callback from native. */
    _resolveCallback(id, result) {
      const resolve = pendingCallbacks.get(id)
      if (resolve) {
        pendingCallbacks.delete(id)
        resolve(result)
      }
    },

    /** @internal Called by native when the user navigates via state restoration or notification. */
    _navigateTo(url) {
      if (url && window.location.pathname + window.location.search !== url) {
        window.history.pushState(null, "", url)
        // Dispatch a popstate event so TanStack Router picks up the change
        window.dispatchEvent(new PopStateEvent("popstate"))
      }
    },

    /** @internal Called by native when shared items arrive while the app is open. */
    _onSharedItems(items) {
      if (sharedItemsCallback && Array.isArray(items) && items.length > 0) {
        sharedItemsCallback(items)
      }
    },
  }

  // Notify the web app that the native bridge is ready
  window.dispatchEvent(new CustomEvent("lumennativeready"))
})()
