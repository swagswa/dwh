importScripts('supabase.min.js')

// Config
const SUPABASE_URL = 'https://kuodvlyepoojqimutmvu.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_n-B1HcuRd0kDc0spwr-oHg_KI-i0itS'
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`

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

// --- Progress reporting ---
async function updateProgress(data) {
  await chrome.storage.local.set({ dwh_sync_progress: data })
}

// --- ChatGPT token ---
async function getChatGPTToken() {
  await updateProgress({ status: 'loading', message: 'Получаю токен ChatGPT...' })
  const res = await fetch('https://chatgpt.com/api/auth/session')
  if (!res.ok) throw new Error(`Auth session fetch failed: ${res.status}`)
  const data = await res.json()
  if (!data.accessToken) throw new Error('Откройте chatgpt.com и войдите в аккаунт')
  return data.accessToken
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
    if (!res.ok) break
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

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

let isSyncing = false

async function runSync(limit) {
  if (isSyncing) {
    console.log('[DWH] Sync already running, ignoring duplicate call')
    return
  }
  isSyncing = true

  chrome.alarms.create('syncKeepAlive', { periodInMinutes: 0.4 })

  try {
    const { data: { session } } = await sb.auth.getSession()
    const jwt = session?.access_token
    if (!jwt) {
      await updateProgress({ status: 'error', error: 'Сессия истекла, перелогиньтесь' })
      return
    }

    console.log('[DWH] JWT length:', jwt.length, 'starts with:', jwt.substring(0, 10))

    const saved = await loadSyncState()
    let neededConvs, chatgptToken, startIndex, synced

    if (saved && saved.neededConvs && saved.currentIndex < saved.neededConvs.length) {
      await updateProgress({ status: 'syncing', message: 'Возобновление синхронизации...' })
      neededConvs = saved.neededConvs
      synced = saved.synced || 0
      startIndex = saved.currentIndex
      chatgptToken = await getChatGPTToken()
    } else {
      chatgptToken = await getChatGPTToken()

      await updateProgress({ status: 'loading', message: 'Загружаю проекты...' })
      const projects = await fetchProjects(chatgptToken)
      if (projects.length > 0) {
        await updateProgress({ status: 'loading', message: `Найдено ${projects.length} проектов, загружаю чаты...` })
      }

      const allConvs = []
      if (projects.length > 0) {
        const projectResults = await Promise.allSettled(
          projects.map(p => fetchProjectConversations(chatgptToken, p))
        )
        for (const r of projectResults) {
          if (r.status === 'fulfilled') allConvs.push(...r.value)
        }
        await updateProgress({ status: 'loading', message: `Из проектов: ${allConvs.length} чатов` })
      }

      await updateProgress({ status: 'loading', message: 'Загружаю обычные чаты...' })
      const syncLimit = limit || 500
      let offset = 0
      while (true) {
        let res, data
        try {
          res = await fetch(`https://chatgpt.com/backend-api/conversations?offset=${offset}&limit=100&order=updated`, {
            headers: { Authorization: `Bearer ${chatgptToken}` },
          })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          data = await res.json()
        } catch (e) {
          console.warn(`[DWH] Conversation list fetch failed at offset ${offset}:`, e.message)
          await updateProgress({ status: 'loading', message: `Ошибка загрузки списка (offset ${offset}), продолжаю с тем что есть...` })
          break
        }
        const items = data.items || []
        allConvs.push(...items)
        await updateProgress({ status: 'loading', message: `Загружено: ${allConvs.length} чатов...` })
        if (items.length < 100) break
        if (allConvs.length >= syncLimit) {
          allConvs.splice(syncLimit)
          break
        }
        offset += 28
        await delay(300)
      }

      await updateProgress({ status: 'checking', message: `Проверяю изменения (${allConvs.length} чатов)...` })
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
        await updateProgress({ status: 'error', error: `sync-chatgpt-check error: ${checkRes.status} — ${errBody}` })
        return
      }

      const checkData = await checkRes.json()
      const neededIds = new Set(checkData.needed_ids || [])

      if (neededIds.size === 0) {
        await updateProgress({ status: 'done', synced: 0, skipped: 0, message: 'Всё актуально, обновлений нет!' })
        await clearSyncState()
        return
      }

      neededConvs = allConvs.filter(c => neededIds.has(c.id))
      synced = 0
      startIndex = 0
      await saveSyncState({ neededConvs, currentIndex: 0, synced: 0 })
    }

    const total = neededConvs.length
    const remaining = total - startIndex
    await updateProgress({
      status: 'syncing',
      current: startIndex,
      total,
      synced,
      skipped: 0,
      message: `Синхронизация: ${remaining} чатов (×5 параллельно)`,
    })
    const PARALLEL = 5
    let batch = []
    let skippedTotal = 0
    for (let i = startIndex; i < total; i += PARALLEL) {
      const group = neededConvs.slice(i, Math.min(i + PARALLEL, total))
      const groupEnd = Math.min(i + PARALLEL, total)
      const groupTitles = group.map(c => c.title || 'Untitled').join(', ')
      const results = await Promise.allSettled(
        group.map(conv =>
          fetch(`https://chatgpt.com/backend-api/conversation/${conv.id}`, {
            headers: { Authorization: `Bearer ${chatgptToken}` },
          }).then(r => r.ok ? r.json() : null)
            .catch(() => null)
        )
      )
      let fetchErrors = 0
      for (let j = 0; j < results.length; j++) {
        const result = results[j]
        if (result.status === 'fulfilled' && result.value) {
          result.value._project_name = group[j]._project_name || null
          result.value._project_id = group[j]._project_id || null
          batch.push(result.value)
        } else {
          fetchErrors++
          console.warn(`[DWH] Skipped chat "${group[j]?.title || group[j]?.id}": fetch failed`)
        }
      }
      if (fetchErrors > 0) skippedTotal += fetchErrors
      const progressIndex = groupEnd
      if (batch.length > 0 && (batch.length >= 25 || progressIndex >= total)) {
        let sendOk = false
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
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
            if (syncRes.ok) {
              const syncData = await syncRes.json()
              synced += syncData.synced || 0
              sendOk = true
              break
            } else {
              const errBody = await syncRes.text()
              console.warn(`[DWH] sync-chatgpt attempt ${attempt + 1}/3 failed:`, syncRes.status, errBody)
            }
          } catch (e) {
            console.warn(`[DWH] sync-chatgpt attempt ${attempt + 1}/3 network error:`, e.message)
          }
          if (attempt < 2) await delay(2000)
        }
        if (!sendOk) {
          console.error('[DWH] Batch failed after 3 attempts, skipping', batch.length, 'conversations')
          skippedTotal += batch.length
        }
        batch = []
      }
      await saveSyncState({ neededConvs, currentIndex: progressIndex, synced })
      await updateProgress({
        status: 'syncing',
        current: progressIndex,
        total,
        synced,
        skipped: skippedTotal,
        message: 'Загрузка чатов...',
        currentTitle: groupTitles,
      })
      await delay(600)
    }
    const skipMsg = skippedTotal > 0 ? ` (пропущено: ${skippedTotal})` : ''
    await updateProgress({
      status: 'done',
      current: total,
      total,
      synced,
      skipped: skippedTotal,
      message: `Готово! Синхронизировано ${synced} чатов.${skipMsg}`,
    })
    await clearSyncState()
  } catch (err) {
    console.error('[DWH] Sync error:', err)
    await updateProgress({ status: 'error', error: err.message })
  } finally {
    isSyncing = false
    chrome.alarms.clear('syncKeepAlive')
  }
}

// --- Keepalive alarm ---
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'syncKeepAlive') {
    const state = await loadSyncState()
    if (state && state.neededConvs && state.currentIndex < state.neededConvs.length) {
      const result = await chrome.storage.local.get('dwh_sync_progress')
      const progress = result.dwh_sync_progress
      if (progress?.status !== 'syncing') {
        console.log('[DWH] Alarm: resuming interrupted sync')
        runSync()
      }
    } else {
      chrome.alarms.clear('syncKeepAlive')
    }
  }
})

// --- Message handler ---
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'startSync') {
    runSync(msg.limit)
    sendResponse({ started: true })
    return false
  }
  if (msg.action === 'getProgress') {
    chrome.storage.local.get('dwh_sync_progress', (r) => {
      sendResponse(r.dwh_sync_progress || { status: 'idle' })
    })
    return true
  }
  if (msg.action === 'getChatGPTToken') {
    fetch('https://chatgpt.com/api/auth/session')
      .then(r => r.json())
      .then(data => sendResponse({ token: data.accessToken }))
      .catch(err => sendResponse({ error: err.message }))
    return true
  }
})
