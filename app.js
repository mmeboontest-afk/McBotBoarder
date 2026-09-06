const socket = io()
const $ = (id) => document.getElementById(id)
const logEl = $('log')
const badge = $('conn-badge')

function appendLog(msg) {
  const line = document.createElement('div')
  line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`
  logEl.appendChild(line)
  logEl.scrollTop = logEl.scrollHeight
}

socket.on('log', (d) => appendLog(d.msg))
socket.on('state', (d) => { $('stat-state').textContent = d.state })
socket.on('status', (d) => {
  if (!d.position) return
  badge.textContent = 'Online'
  badge.className = 'badge online'
  $('stat-pos').textContent = `${Math.round(d.position.x)}, ${Math.round(d.position.y)}, ${Math.round(d.position.z)}`
  $('stat-hp').textContent = d.health
  $('stat-food').textContent = d.food
  $('stat-inv').textContent = d.inventoryCount
  if (d.state) $('stat-state').textContent = d.state
})

async function postJSON(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'เกิดข้อผิดพลาด')
  return data
}

$('btn-connect').onclick = async () => {
  try {
    await postJSON('/api/connect', {
      host: $('host').value,
      port: $('port').value,
      version: $('version').value,
      username: $('username').value,
      auth: $('auth').value,
      skin: $('skin').value,
      borderZ: $('borderZ').value,
      checkpointDistance: $('checkpointDistance').value
    })
    badge.textContent = 'Connecting...'
    badge.className = 'badge online'
  } catch (e) {
    appendLog('Connect error: ' + e.message)
  }
}

$('btn-disconnect').onclick = async () => {
  try {
    await postJSON('/api/disconnect')
    badge.textContent = 'Offline'
    badge.className = 'badge offline'
  } catch (e) {
    appendLog('Disconnect error: ' + e.message)
  }
}

$('btn-golive').onclick = async () => {
  try {
    await postJSON('/api/golive', {
      obsHost: $('obsHost').value,
      obsPort: $('obsPort').value,
      obsPassword: $('obsPassword').value
    })
  } catch (e) {
    appendLog('Go Live error: ' + e.message)
  }
}

$('btn-stoplive').onclick = async () => {
  try {
    await postJSON('/api/stoplive', {
      obsHost: $('obsHost').value,
      obsPort: $('obsPort').value,
      obsPassword: $('obsPassword').value
    })
  } catch (e) {
    appendLog('Stop Live error: ' + e.message)
  }
}

$('btn-yt-golive').onclick = async () => {
  try {
    const data = await postJSON('/api/youtube/golive', {
      title: $('ytTitle').value,
      description: $('ytDesc').value,
      privacyStatus: $('ytPrivacy').value,
      obsHost: $('obsHost').value,
      obsPort: $('obsPort').value,
      obsPassword: $('obsPassword').value
    })
    appendLog('ลิงก์ไลฟ์: ' + data.watchUrl)
  } catch (e) {
    appendLog('YouTube Go Live error: ' + e.message)
  }
}

$('btn-yt-stop').onclick = async () => {
  try {
    await postJSON('/api/youtube/stop', {
      obsHost: $('obsHost').value,
      obsPort: $('obsPort').value,
      obsPassword: $('obsPassword').value
    })
  } catch (e) {
    appendLog('YouTube stop error: ' + e.message)
  }
}
