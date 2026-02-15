import type { Message, Settings } from "./types"

// ---------------------------------------------------------------------------
// DOM references
// ---------------------------------------------------------------------------

const loadingView = document.getElementById("loading")!
const setupView = document.getElementById("setup")!
const mainView = document.getElementById("main")!

const setupForm = document.getElementById("setup-form") as HTMLFormElement
const setupError = document.getElementById("setup-error")!
const saveBtn = document.getElementById("save-btn") as HTMLButtonElement

const noteExistsDiv = document.getElementById("note-exists")!
const noNoteDiv = document.getElementById("no-note")!
const noteLink = document.getElementById("note-link") as HTMLAnchorElement
const highlightToggle = document.getElementById("highlight-toggle") as HTMLInputElement
const createBtn = document.getElementById("create-btn") as HTMLButtonElement
const syncBtn = document.getElementById("sync-btn") as HTMLButtonElement
const settingsBtn = document.getElementById("settings-btn") as HTMLButtonElement

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function send(message: Message): Promise<Message> {
  return chrome.runtime.sendMessage(message)
}

function show(el: HTMLElement) {
  el.classList.remove("hidden")
}

function hide(el: HTMLElement) {
  el.classList.add("hidden")
}

async function getCurrentTab(): Promise<chrome.tabs.Tab | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab ?? null
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

function showLoading() {
  show(loadingView)
  hide(setupView)
  hide(mainView)
}

function showSetup(settings?: Settings | null) {
  hide(loadingView)
  show(setupView)
  hide(mainView)

  // Pre-fill with existing settings if available
  if (settings) {
    ;(document.getElementById("token") as HTMLInputElement).value = settings.githubToken
    ;(document.getElementById("login") as HTMLInputElement).value = settings.githubLogin
    ;(document.getElementById("name") as HTMLInputElement).value = settings.githubName
    ;(document.getElementById("email") as HTMLInputElement).value = settings.githubEmail
    ;(document.getElementById("repo-owner") as HTMLInputElement).value = settings.repoOwner
    ;(document.getElementById("repo-name") as HTMLInputElement).value = settings.repoName
    ;(document.getElementById("lumen-url") as HTMLInputElement).value = settings.lumenBaseUrl
  }
}

async function showMain() {
  hide(loadingView)
  hide(setupView)
  show(mainView)

  const tab = await getCurrentTab()
  if (!tab?.url) {
    show(noNoteDiv)
    hide(noteExistsDiv)
    return
  }

  const response = await send({ type: "CHECK_URL", url: tab.url })

  if (response.type === "URL_STATUS" && response.exists && response.note) {
    show(noteExistsDiv)
    hide(noNoteDiv)

    noteLink.href = response.note.lumenUrl
    noteLink.textContent = response.note.title || "Untitled note"

    // Get highlight state
    const hlResponse = await send({ type: "GET_HIGHLIGHT_STATE", url: tab.url })
    highlightToggle.checked =
      hlResponse.type === "HIGHLIGHT_STATE" ? hlResponse.enabled : false
  } else {
    hide(noteExistsDiv)
    show(noNoteDiv)
  }
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

setupForm.addEventListener("submit", async (e) => {
  e.preventDefault()
  hide(setupError)
  saveBtn.disabled = true
  saveBtn.textContent = "Cloning..."

  const settings: Settings = {
    githubToken: (document.getElementById("token") as HTMLInputElement).value.trim(),
    githubLogin: (document.getElementById("login") as HTMLInputElement).value.trim(),
    githubName: (document.getElementById("name") as HTMLInputElement).value.trim(),
    githubEmail: (document.getElementById("email") as HTMLInputElement).value.trim(),
    repoOwner: (document.getElementById("repo-owner") as HTMLInputElement).value.trim(),
    repoName: (document.getElementById("repo-name") as HTMLInputElement).value.trim(),
    lumenBaseUrl: (document.getElementById("lumen-url") as HTMLInputElement).value.trim(),
  }

  const response = await send({ type: "SAVE_SETTINGS", settings })

  if (response.type === "SETTINGS_SAVED" && response.success) {
    await showMain()
  } else {
    const msg = response.type === "SETTINGS_SAVED" ? response.error : "Unknown error"
    setupError.textContent = msg ?? "Failed to connect"
    show(setupError)
    saveBtn.disabled = false
    saveBtn.textContent = "Connect & clone"
  }
})

createBtn.addEventListener("click", async () => {
  const tab = await getCurrentTab()
  if (!tab?.url) return

  createBtn.disabled = true
  createBtn.textContent = "Creating..."

  const response = await send({
    type: "CREATE_NOTE",
    url: tab.url,
    title: tab.title ?? "Untitled",
  })

  if (response.type === "NOTE_CREATED") {
    // Notify the content script
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, response)
    }
    await showMain()
  } else {
    createBtn.disabled = false
    createBtn.textContent = "Save this page"
  }
})

highlightToggle.addEventListener("change", async () => {
  const tab = await getCurrentTab()
  if (!tab?.url) return

  await send({
    type: "SET_HIGHLIGHT_STATE",
    url: tab.url,
    enabled: highlightToggle.checked,
  })
})

syncBtn.addEventListener("click", async () => {
  syncBtn.disabled = true
  syncBtn.textContent = "Syncing..."

  const response = await send({ type: "SYNC" })

  syncBtn.disabled = false
  syncBtn.textContent = response.type === "SYNC_RESULT" && response.success ? "Synced!" : "Error"
  setTimeout(() => {
    syncBtn.textContent = "Sync"
  }, 1500)
})

settingsBtn.addEventListener("click", async () => {
  const response = await send({ type: "GET_SETTINGS" })
  if (response.type === "SETTINGS_RESULT") {
    showSetup(response.settings)
  }
})

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

async function init() {
  showLoading()

  const response = await send({ type: "GET_SETTINGS" })

  if (response.type === "SETTINGS_RESULT") {
    if (response.settings && response.isRepoCloned) {
      await showMain()
    } else {
      showSetup(response.settings)
    }
  } else {
    showSetup()
  }
}

init()
