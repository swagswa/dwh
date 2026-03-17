// Config — replace with real values before packaging
const SUPABASE_URL = 'https://kuodvlyepoojqimutmvu.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_n-B1HcuRd0kDc0spwr-oHg_KI-i0itS'
const FUNCTIONS_URL = `${SUPABASE_URL}/functions/v1`

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// DOM elements
const loginSection = document.getElementById('login-section')
const syncSection = document.getElementById('sync-section')
const loginBtn = document.getElementById('login-btn')
const syncBtn = document.getElementById('sync-btn')
const logoutBtn = document.getElementById('logout-btn')
const syncStatus = document.getElementById('sync-status')
const progressContainer = document.getElementById('progress-container')
const progressFill = document.getElementById('progress-fill')
const loginError = document.getElementById('login-error')

// --- Init ---
async function init() {
  const { data: { session } } = await sb.auth.getSession()
  if (session) showSync()
  else showLogin()
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

function setProgress(current, total) {
  progressContainer.classList.remove('hidden')
  const pct = total > 0 ? Math.round((current / total) * 100) : 0
  progressFill.style.width = `${pct}%`
}

// --- Login ---
loginBtn.addEventListener('click', async () => {
  const email = document.getElementById('email').value.trim()
  const password = document.getElementById('password').value
  loginError.classList.add('hidden')
  loginBtn.disabled = true

  const { error } = await sb.auth.signInWithPassword({ email, password })
  loginBtn.disabled = false

  if (error) {
    loginError.textContent = error.message
    loginError.classList.remove('hidden')
    return
  }
  showSync()
})

// --- Logout ---
logoutBtn.addEventListener('click', async () => {
  await sb.auth.signOut()
  showLogin()
})

// --- Sync ---
syncBtn.addEventListener('click', async () => {
  syncBtn.disabled = true
  progressContainer.classList.add('hidden')

  try {
    // 1. Get ChatGPT token
    setStatus('Получаю токен ChatGPT...')
    const tokenData = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'getChatGPTToken' }, (res) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
        else if (res?.error) reject(new Error(res.error))
        else if (!res?.token) reject(new Error('Откройте chatgpt.com и войдите в аккаунт'))
        else resolve(res)
      })
    })
    const chatgptToken = tokenData.token

    // 2. Load conversation list
    setStatus('Загружаю список чатов...')
    const allConvs = []
    let offset = 0
    while (true) {
      const res = await fetch(`https://chatgpt.com/backend-api/conversations?offset=${offset}&limit=28`, {
        headers: { Authorization: `Bearer ${chatgptToken}` },
      })
      if (!res.ok) throw new Error(`ChatGPT API error: ${res.status}`)
      const data = await res.json()
      const items = data.items || []
      allConvs.push(...items)
      setStatus(`Загружен список: ${allConvs.length} чатов...`)
      if (items.length < 28) break
      offset += 28
      await delay(1000)
    }

    // 3. Check which need syncing
    setStatus(`Проверяю изменения (${allConvs.length} чатов)...`)
    const { data: { session } } = await sb.auth.getSession()
    const jwt = session?.access_token

    const checkRes = await fetch(`${FUNCTIONS_URL}/sync-chatgpt-check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({
        items: allConvs.map(c => ({ id: c.id, update_time: c.update_time })),
      }),
    })
    const checkData = await checkRes.json()
    const neededIds = new Set(checkData.needed_ids || [])

    if (neededIds.size === 0) {
      setStatus('Всё актуально, обновлений нет!', 'success')
      syncBtn.disabled = false
      return
    }

    setStatus(`Нужно обновить: ${neededIds.size} из ${allConvs.length} чатов`)
    setProgress(0, neededIds.size)

    // 4. Fetch only needed conversations and send in batches of 10
    const neededConvs = allConvs.filter(c => neededIds.has(c.id))
    let synced = 0
    let batch = []

    for (let i = 0; i < neededConvs.length; i++) {
      const conv = neededConvs[i]
      setStatus(`Загрузка: ${i + 1}/${neededConvs.length} — ${conv.title || 'Untitled'}`)

      const convRes = await fetch(`https://chatgpt.com/backend-api/conversation/${conv.id}`, {
        headers: { Authorization: `Bearer ${chatgptToken}` },
      })
      if (!convRes.ok) {
        console.error(`Failed to fetch conversation ${conv.id}: ${convRes.status}`)
        continue
      }

      const fullConv = await convRes.json()
      batch.push(fullConv)

      // Send batch every 10 or at the end
      if (batch.length >= 10 || i === neededConvs.length - 1) {
        const syncRes = await fetch(`${FUNCTIONS_URL}/sync-chatgpt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
          body: JSON.stringify({ conversations: batch }),
        })
        const syncData = await syncRes.json()
        synced += syncData.synced || 0
        batch = []
      }

      setProgress(i + 1, neededConvs.length)
      await delay(2000 + Math.random() * 1000)  // 2-3 sec delay (anti-ban)
    }

    setStatus(`Готово! Синхронизировано ${synced} чатов.`, 'success')
  } catch (err) {
    setStatus(`Ошибка: ${err.message}`, 'error')
    console.error(err)
  }

  syncBtn.disabled = false
})

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

init()
