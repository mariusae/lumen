import type { Message, NoteInfo } from "./types"

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let currentNote: NoteInfo | null = null
let highlightingEnabled = false
let topBar: HTMLElement | null = null

// ---------------------------------------------------------------------------
// Send messages to background
// ---------------------------------------------------------------------------

function send(message: Message): Promise<Message> {
  return chrome.runtime.sendMessage(message)
}

// ---------------------------------------------------------------------------
// Top bar
// ---------------------------------------------------------------------------

function createTopBar(note: NoteInfo, highlightOn: boolean) {
  removeTopBar()

  highlightingEnabled = highlightOn

  const bar = document.createElement("div")
  bar.id = "lumen-topbar"

  const left = document.createElement("div")
  left.className = "lumen-topbar-left"

  const icon = document.createElement("span")
  icon.className = "lumen-topbar-icon"
  icon.textContent = "\u270F" // pencil

  const label = document.createElement("a")
  label.className = "lumen-topbar-link"
  label.href = note.lumenUrl
  label.target = "_blank"
  label.rel = "noopener"
  label.textContent = note.title || "Untitled note"
  label.title = "Open in Lumen"

  left.appendChild(icon)
  left.appendChild(label)

  const right = document.createElement("div")
  right.className = "lumen-topbar-right"

  const toggleLabel = document.createElement("label")
  toggleLabel.className = "lumen-topbar-toggle"
  toggleLabel.textContent = "Highlighting"

  const toggle = document.createElement("input")
  toggle.type = "checkbox"
  toggle.checked = highlightOn
  toggle.className = "lumen-topbar-checkbox"
  toggle.addEventListener("change", () => {
    highlightingEnabled = toggle.checked
    send({ type: "SET_HIGHLIGHT_STATE", url: location.href, enabled: toggle.checked })
    updateSelectionListener()
  })

  toggleLabel.prepend(toggle)

  const closeBtn = document.createElement("button")
  closeBtn.className = "lumen-topbar-close"
  closeBtn.textContent = "\u00D7" // ×
  closeBtn.title = "Dismiss"
  closeBtn.addEventListener("click", () => {
    removeTopBar()
  })

  right.appendChild(toggleLabel)
  right.appendChild(closeBtn)

  bar.appendChild(left)
  bar.appendChild(right)

  document.body.prepend(bar)
  document.body.classList.add("lumen-topbar-active")
  topBar = bar
}

function removeTopBar() {
  if (topBar) {
    topBar.remove()
    topBar = null
    document.body.classList.remove("lumen-topbar-active")
  }
}

// ---------------------------------------------------------------------------
// Highlight capture
// ---------------------------------------------------------------------------

let saveButton: HTMLElement | null = null

function showSaveButton(x: number, y: number, text: string) {
  removeSaveButton()

  const btn = document.createElement("button")
  btn.id = "lumen-save-highlight"
  btn.textContent = "+ Save highlight"
  btn.style.left = `${x}px`
  btn.style.top = `${y}px`

  btn.addEventListener("click", async (e) => {
    e.preventDefault()
    e.stopPropagation()

    btn.textContent = "Saving..."
    btn.disabled = true

    try {
      await send({ type: "ADD_HIGHLIGHT", url: location.href, text })
      btn.textContent = "Saved!"
      setTimeout(() => removeSaveButton(), 800)
    } catch (err) {
      btn.textContent = "Error"
      setTimeout(() => removeSaveButton(), 1500)
    }
  })

  document.body.appendChild(btn)
  saveButton = btn
}

function removeSaveButton() {
  if (saveButton) {
    saveButton.remove()
    saveButton = null
  }
}

function onMouseUp() {
  if (!highlightingEnabled || !currentNote) return

  const selection = window.getSelection()
  if (!selection || selection.isCollapsed) {
    removeSaveButton()
    return
  }

  const text = selection.toString().trim()
  if (!text) {
    removeSaveButton()
    return
  }

  const range = selection.getRangeAt(0)
  const rect = range.getBoundingClientRect()

  // Position the save button just below the selection
  const x = rect.left + window.scrollX + rect.width / 2 - 60
  const y = rect.bottom + window.scrollY + 6

  showSaveButton(x, y, text)
}

function onMouseDown(e: MouseEvent) {
  // If clicking outside the save button, dismiss it
  if (saveButton && !saveButton.contains(e.target as Node)) {
    removeSaveButton()
  }
}

function updateSelectionListener() {
  if (highlightingEnabled && currentNote) {
    document.addEventListener("mouseup", onMouseUp)
    document.addEventListener("mousedown", onMouseDown)
  } else {
    document.removeEventListener("mouseup", onMouseUp)
    document.removeEventListener("mousedown", onMouseDown)
    removeSaveButton()
  }
}

// ---------------------------------------------------------------------------
// Initialize on page load
// ---------------------------------------------------------------------------

async function init() {
  try {
    const response = await send({ type: "CHECK_URL", url: location.href })

    if (response.type === "URL_STATUS" && response.exists && response.note) {
      currentNote = response.note

      // Check highlight state
      const hlResponse = await send({ type: "GET_HIGHLIGHT_STATE", url: location.href })
      const hlEnabled = hlResponse.type === "HIGHLIGHT_STATE" ? hlResponse.enabled : false

      createTopBar(currentNote, hlEnabled)
      updateSelectionListener()
    }
  } catch (err) {
    // Extension context might be invalidated; silently ignore
    console.debug("Lumen extension: could not check URL", err)
  }
}

// Listen for messages from the popup (e.g., after creating a note)
chrome.runtime.onMessage.addListener((message: Message) => {
  if (message.type === "NOTE_CREATED") {
    currentNote = message.note
    createTopBar(currentNote, true)
    highlightingEnabled = true
    updateSelectionListener()
  }
})

// Run
init()
