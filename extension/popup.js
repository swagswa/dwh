// Config
const SUPABASE_URL = 'https://kuodvlyepoojqimutmvu.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_n-B1HcuRd0kDc0spwr-oHg_KI-i0itS'
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`

// Limit is controlled by the slider in popup.html

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

// --- Sync state persistence ---
const SYNC_STATE_KEY = 'dwh_sync_state'

async function saveSyncState(state) {
  await chrome.storage.local.set({ [SYNC_STATE_KEY]: state })
}

async function loadSyncState() {
  const result = await chrome.storage.local.get(SYNC_STATE_KEY)
  return result[SYNC_STATE_KEY] || null
}

async function clearSyncState() {
  await chrome.storage.local.remove(SYNC_STATE_KEY)
}

// --- Project helpers ---
async function fetchProjects(token) {
  const projects = []
  let cursor = null
  while (true) {
    const url = 'https://chatgpt.com/backend-api/gizmos/snorlax/sidebar' + (cursor ? `?cursor=${cursor}` : '')
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) break // Projects not available (free tier) — skip silently
    const data = await res.json()
    const items = data.items || []
    for (const item of items) {
      if (item.gizmo?.id) {
        projects.push({
          id: item.gizmo.id,
          name: item.gizmo.display?.name || 'Unnamed Project',
        })
      }
    }
    cursor = data.cursor
    if (!cursor) break
  }
  return projects
}

async function fetchProjectConversations(token, project) {
  const convs = []
  let cursor = '0'
  while (cursor !== null) {
    const url = `https://chatgpt.com/backend-api/gizmos/${project.id}/conversations?cursor=${cursor}`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) break
    const data = await res.json()
    const items = data.items || []
    for (const item of items) {
      item._project_name = project.name
      item._project_id = project.id
      convs.push(item)
    }
    cursor = data.cursor ?? null
    if (cursor === undefined || cursor === null) break
    await delay(500)
  }
  return convs
}

// --- Init ---
async function init() {
  // Debug: check what's in storage
  const allStorage = await chrome.storage.local.get(null)
  console.log('[DWH] chrome.storage.local contents:', Object.keys(allStorage))

  const { data: { session }, error } = await sb.auth.getSession()
  console.log('[DWH] getSession result:', session ? `logged in as ${session.user.email}` : 'no session', error || '')

  if (session) {
    showSync()
    // Check for interrupted sync
    const saved = await loadSyncState()
    if (saved && saved.neededConvs && saved.currentIndex < saved.neededConvs.length) {
      const remaining = saved.neededConvs.length - saved.currentIndex
      setStatus(`Прервано: ${saved.currentIndex}/${saved.neededConvs.length} чатов. Нажмите "Продолжить"`)
      setProgress(saved.currentIndex, saved.neededConvs.length, 'Приостановлено')
      syncBtn.textContent = `Продолжить (${remaining} ост.)`
    }
  } else {
    showLogin()
  }
}

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
  await clearSyncState()
  await sb.auth.signOut()
  // Also clear our storage key to be safe
  await chrome.storage.local.remove(STORAGE_KEY)
  showLogin()
})

// --- Sync ---
syncBtn.addEventListener('click', async () => {
  syncBtn.disabled = true
  progressContainer.classList.add('hidden')

  try {
    const { data: { session } } = await sb.auth.getSession()
    const jwt = session?.access_token
    if (!jwt) throw new Error('Сессия истекла, перелогиньтесь')

    console.log('[DWH] JWT length:', jwt.length, 'starts with:', jwt.substring(0, 10))

    // Check for saved state (resume interrupted sync)
    const saved = await loadSyncState()
    let neededConvs, chatgptToken, startIndex, synced

    if (saved && saved.neededConvs && saved.currentIndex < saved.neededConvs.length) {
      // --- RESUME mode ---
      setStatus('Возобновление синхронизации...')
      neededConvs = saved.neededConvs
      synced = saved.synced || 0
      startIndex = saved.currentIndex
      chatgptToken = await getChatGPTToken()
    } else {
      // --- FRESH sync ---
      chatgptToken = await getChatGPTToken()

      // Load projects first
      setStatus('Загружаю проекты...')
      const projects = await fetchProjects(chatgptToken)
      if (projects.length > 0) {
        setStatus(`Найдено ${projects.length} проектов, загружаю чаты...`)
      }

      // Fetch conversations from all projects
      const allConvs = []
      for (const project of projects) {
        setStatus(`Проект "${project.name}": загружаю чаты...`)
        const projectConvs = await fetchProjectConversations(chatgptToken, project)
        allConvs.push(...projectConvs)
        setStatus(`Проект "${project.name}": ${projectConvs.length} чатов`)
        await delay(500)
      }

      // Load regular (non-project) conversations
      setStatus('Загружаю обычные чаты...')
      let offset = 0
      while (true) {
        const res = await fetch(`https://chatgpt.com/backend-api/conversations?offset=${offset}&limit=28`, {
          headers: { Authorization: `Bearer ${chatgptToken}` },
        })
        if (!res.ok) throw new Error(`ChatGPT API error: ${res.status}`)
        const data = await res.json()
        const items = data.items || []
        allConvs.push(...items)
        setStatus(`Загружено: ${allConvs.length} чатов...`)

        const limit = parseInt(chatLimitInput.value) || parseInt(chatLimitSlider.value) || 500
        if (items.length < 28) break
        if (allConvs.length >= limit) {
          allConvs.splice(limit)
          break
        }
        offset += 28
        await delay(1000)
      }

      // Check which need syncing
      setStatus(`Проверяю изменения (${allConvs.length} чатов)...`)
      const checkRes = await fetch(`${FUNCTIONS_URL}/sync-chatgpt-check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          items: allConvs.map(c => ({ id: c.id, update_time: c.update_time })),
        }),
      })

      if (!checkRes.ok) {
        const errBody = await checkRes.text()
        console.error('[DWH] sync-chatgpt-check failed:', checkRes.status, errBody)
        throw new Error(`sync-chatgpt-check error: ${checkRes.status} — ${errBody}`)
      }

      const checkData = await checkRes.json()
      const neededIds = new Set(checkData.needed_ids || [])

      if (neededIds.size === 0) {
        setStatus('Всё актуально, обновлений нет!', 'success')
        await clearSyncState()
        syncBtn.disabled = false
        syncBtn.textContent = 'Синхронизировать'
        return
      }

      neededConvs = allConvs.filter(c => neededIds.has(c.id))
      synced = 0
      startIndex = 0

      // Save initial state
      await saveSyncState({ neededConvs, currentIndex: 0, synced: 0 })
    }

    const total = neededConvs.length
    const remaining = total - startIndex
    setStatus(`Синхронизация: ${remaining} чатов (×3 параллельно)`)
    setProgress(startIndex, total)

    // Fetch conversations in parallel groups of 3, then send in batches of 10
    const PARALLEL = 3
    let batch = []

    for (let i = startIndex; i < total; i += PARALLEL) {
      // Fetch up to 3 conversations in parallel
      const group = neededConvs.slice(i, Math.min(i + PARALLEL, total))
      const groupEnd = Math.min(i + PARALLEL, total)
      const groupTitles = group.map(c => c.title || 'Untitled').join(', ')

      const results = await Promise.allSettled(
        group.map(conv =>
          fetch(`https://chatgpt.com/backend-api/conversation/${conv.id}`, {
            headers: { Authorization: `Bearer ${chatgptToken}` },
          }).then(r => r.ok ? r.json() : null)
        )
      )

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          batch.push(result.value)
        }
      }

      const progressIndex = groupEnd

      // Send batch every 10 or at the end
      if (batch.length >= 10 || progressIndex >= total) {
        const { data: { session: freshSession } } = await sb.auth.getSession()
        const freshJwt = freshSession?.access_token || jwt

        const syncRes = await fetch(`${FUNCTIONS_URL}/sync-chatgpt`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${freshJwt}`,
            apikey: SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ conversations: batch }),
        })
        if (!syncRes.ok) {
          const errBody = await syncRes.text()
          console.error('[DWH] sync-chatgpt failed:', syncRes.status, errBody)
          throw new Error(`sync-chatgpt error: ${syncRes.status} — ${errBody}`)
        }
        const syncData = await syncRes.json()
        synced += syncData.synced || 0
        batch = []
      }

      await saveSyncState({ neededConvs, currentIndex: progressIndex, synced })
      setProgress(progressIndex, total, groupTitles)
      setStatus(`Загрузка чатов...`)
      await delay(1500)  // 1.5 sec between groups of 3
    }

    setStatus(`Готово! Синхронизировано ${synced} чатов.`, 'success')
    await clearSyncState()
    syncBtn.textContent = 'Синхронизировать'
  } catch (err) {
    setStatus(`Ошибка: ${err.message}`, 'error')
    console.error('[DWH] Sync error:', err)
  }

  syncBtn.disabled = false
})

// --- Helpers ---
async function getChatGPTToken() {
  setStatus('Получаю токен ChatGPT...')
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: 'getChatGPTToken' }, (res) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
      else if (res?.error) reject(new Error(res.error))
      else if (!res?.token) reject(new Error('Откройте chatgpt.com и войдите в аккаунт'))
      else resolve(res.token)
    })
  })
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

init()
