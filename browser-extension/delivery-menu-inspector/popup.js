import { requestCapture } from './capture-client.js'

const RECEIVER_URL = 'http://127.0.0.1:39481/inspection-snapshots'

const statusElement = document.querySelector('#status')
const captureButton = document.querySelector('#capture-button')

const setStatus = (message) => {
  if (statusElement) {
    statusElement.textContent = message
  }
}

const getActiveTab = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab
}

const postSnapshot = async (snapshot) => {
  const response = await fetch(RECEIVER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(snapshot)
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload.error || `receiver_http_${response.status}`)
  }
}

captureButton?.addEventListener('click', async () => {
  captureButton.disabled = true

  try {
    setStatus('메뉴 화면을 위에서 아래까지 읽는 중입니다...')

    const tab = await getActiveTab()
    if (!tab?.id) {
      throw new Error('active_tab_not_found')
    }

    const snapshot = await requestCapture({
      tabId: tab.id,
      sendMessage: chrome.tabs.sendMessage,
      executeScript: chrome.scripting.executeScript
    })

    if (!snapshot) {
      throw new Error('snapshot_not_available')
    }

    let screenshotDataUrl = null
    try {
      screenshotDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' })
    } catch {
      screenshotDataUrl = null
    }

    const payload = {
      snapshotId: `snap-${Date.now()}`,
      source: 'browser_extension',
      ...snapshot,
      screenshotDataUrl: screenshotDataUrl ?? snapshot.screenshotDataUrl ?? null
    }

    await postSnapshot(payload)
    setStatus('전체 캡처를 로컬 앱으로 보냈습니다.')
  } catch (error) {
    setStatus(`전송하지 못했습니다. ${error instanceof Error ? error.message : 'unknown_error'}`)
  } finally {
    captureButton.disabled = false
  }
})
