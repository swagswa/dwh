chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'getChatGPTToken') {
    fetch('https://chatgpt.com/api/auth/session')
      .then(r => r.json())
      .then(data => sendResponse({ token: data.accessToken }))
      .catch(err => sendResponse({ error: err.message }))
    return true
  }
})
