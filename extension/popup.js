// Config
const SUPABASE_URL = 'https://kuodvlyepoojqimutmvu.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_n-B1HcuRd0kDc0spwr-oHg_KI-i0itS'

// --- Chrome storage adapter for Supabase auth ---
// Supabase by default uses localStorage, which is wiped when popup closes.
// chrome.storage.local persists across popup opens/closes.
const STORAGE_KEY = 'dwh_supabase_auth'

const chromeStorageAdapter = {
  getItem: async (key) => {
    const result = await chrome.storage.local.get(STORAGE_KEY)
    const store = result[STORAGE_KEY] || {}
    return store[key] ?? null
  },
  setItem: async (key, value) => {
    const result = await chrome.storage.local.get(STORAGE_KEY)
    const store = result[STORAGE_KEY] || {}
    store[key] = value
    await chrome.storage.local.set({ [STORAGE_KEY]: store })
  },
  removeItem: async (key) => {
    const result = await chrome.storage.local.get(STORAGE_KEY)
    const store = result[STORAGE_KEY] || {}
    delete store[key]
    await chrome.storage.local.set({ [STORAGE_KEY]: store })
  },
}

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: chromeStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

// DOM elements
const loginSection = document.getElementById('login-section')
const syncSection = document.getElementById('sync-section')
const loginBtn = document.getElementById('login-btn')
const syncBtn = document.getElementById('sync-btn')
const logoutBtn = document.getElementById('logout-btn')
const syncStatus = document.getElementById('sync-status')
const progressContainer = document.getElementById('progress-container')
const progressFill = document.getElementById('progress-fill')
const progressCurrent = document.getElementById('progress-current')
const progressTotal = document.getElementById('progress-total')
const progressPct = document.getElementById('progress-pct')
const progressTitle = document.getElementById('progress-title')
const loginError = document.getElementById('login-error')
const chatLimitSlider = document.getElementById('chat-limit')
const chatLimitInput = document.getElementById('chat-limit-input')

function updateLimit(val) {
  const n = Math.max(1, parseInt(val) || 50)
  chatLimitSlider.value = Math.min(n, 2000)
  chatLimitInput.value = n
  syncBtn.textContent = `Синхронизировать (${n})`
}

chatLimitSlider.addEventListener('input', () => updateLimit(chatLimitSlider.value))
chatLimitInput.addEventListener('change', () => updateLimit(chatLimitInput.value))

// --- UI helpers ---
function showLogin() {
  loginSection.classList.remove('hidden')
  syncSection.classList.add('hidden')
}

function showSync() {
  loginSection.classList.add('hidden')
  syncSection.classList.remove('hidden')
}

function setStatus(text, type = 'info') {
  syncStatus.textContent = text
  syncStatus.className = `status ${type}`
  syncStatus.classList.remove('hidden')
}

let lastProgressValue = -1
function setProgress(current, total, title) {
  progressContainer.classList.remove('hidden')
  const pct = total > 0 ? Math.round((current / total) * 100) : 0
  progressFill.style.width = `${pct}%`
  progressTotal.textContent = total
  progressPct.textContent = `${pct}%`

  // Animate the counter bump
  if (current !== lastProgressValue) {
    progressCurrent.textContent = current
    progressCurrent.classList.remove('bump')
    void progressCurrent.offsetWidth // force reflow
    progressCurrent.classList.add('bump')
    lastProgressValue = current
  }

  if (title) progressTitle.textContent = title
}

// --- Live progress from background.js ---
function updateUI(p) {
  // p = { status, current, total, synced, skipped, message, currentTitle, error }

  if (p.status === 'idle') {
    syncBtn.disabled = false
    syncBtn.textContent = `Синхронизировать (${chatLimitInput.value || chatLimitSlider.value || 50})`
    progressContainer.classList.add('hidden')
    syncStatus.classList.add('hidden')
    return
  }

  if (p.status === 'error') {
    setStatus(`Ошибка: ${p.error}`, 'error')
    syncBtn.disabled = false
    syncBtn.textContent = `Синхронизировать (${chatLimitInput.value || chatLimitSlider.value || 50})`
    return
  }

  if (p.status === 'done') {
    const skipMsg = p.skipped > 0 ? ` (пропущено: ${p.skipped})` : ''
    setStatus(`Готово! Синхронизировано ${p.synced} чатов.${skipMsg}`, p.skipped > 0 ? 'warning' : 'success')
    syncBtn.disabled = false
    syncBtn.textContent = `Синхронизировать (${chatLimitInput.value || chatLimitSlider.value || 50})`
    return
  }

  // syncing / loading / checking
  syncBtn.disabled = true
  syncBtn.textContent = 'Синхронизация...'
  setStatus(p.message, 'info')
  if (p.total > 0) {
    setProgress(p.current, p.total, p.currentTitle)
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.dwh_sync_progress) {
    const p = changes.dwh_sync_progress.newValue
    if (!p) return
    updateUI(p)
  }
})

// --- Sync button ---
syncBtn.addEventListener('click', async () => {
  syncBtn.disabled = true
  const limit = parseInt(chatLimitInput.value) || parseInt(chatLimitSlider.value) || 500
  chrome.runtime.sendMessage({ action: 'startSync', limit })
})

// --- Login ---
loginBtn.addEventListener('click', async () => {
  const email = document.getElementById('email').value.trim()
  const password = document.getElementById('password').value
  loginError.classList.add('hidden')
  loginBtn.disabled = true
  loginBtn.textContent = 'Вхожу...'

  const { data, error } = await sb.auth.signInWithPassword({ email, password })
  loginBtn.disabled = false
  loginBtn.textContent = 'Войти'

  if (error) {
    loginError.textContent = error.message
    loginError.classList.remove('hidden')
    return
  }

  console.log('[DWH] Login success:', data.user.email)
  showSync()
})

// --- Logout ---
logoutBtn.addEventListener('click', async () => {
  await sb.auth.signOut()
  // Also clear our storage key to be safe
  await chrome.storage.local.remove(STORAGE_KEY)
  showLogin()
})

// --- Init ---
async function init() {
  const { data: { session } } = await sb.auth.getSession()

  if (session) {
    showSync()
    // Show current progress immediately if sync is running
    const result = await chrome.storage.local.get('dwh_sync_progress')
    const p = result.dwh_sync_progress
    if (p && p.status !== 'idle') {
      updateUI(p)
    }
  } else {
    showLogin()
  }
}

init()
