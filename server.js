require('dotenv').config()
const path = require('path')
const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const { createBot } = require('./bot/createBot')
const { BotController } = require('./bot/behavior')
const { goLiveOnOBS, stopLiveOnOBS, setStreamKeyAndGoLive } = require('./obs/obsControl')
const { createBroadcastAndStream, transitionBroadcast } = require('./youtube/ytApi')

const app = express()
const server = http.createServer(app)
const io = new Server(server)

app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))

let bot = null
let controller = null
let currentSkin = null
let currentBroadcastId = null

function emitLog(msg) {
  console.log(msg)
  io.emit('log', { time: Date.now(), msg })
}

function emitState(state) {
  io.emit('state', { state })
}

function emitStatusLoop() {
  setInterval(() => {
    if (!bot || !bot.entity) return
    io.emit('status', {
      position: bot.entity.position,
      health: bot.health,
      food: bot.food,
      state: controller ? controller.state : null,
      inventoryCount: bot.inventory ? bot.inventory.items().length : 0
    })
  }, 1000)
}
emitStatusLoop()

app.post('/api/connect', (req, res) => {
  if (bot) {
    return res.status(400).json({ error: 'บอทเชื่อมต่ออยู่แล้ว กด Disconnect ก่อน' })
  }
  const { host, port, version, username, skin, borderZ, checkpointDistance, auth } = req.body

  try {
    bot = createBot({ host, port, version, username: username || 'Fizzy14', auth })
    currentSkin = skin || null

    controller = new BotController(bot, {
      onLog: emitLog,
      onState: emitState,
      borderZ: borderZ !== undefined && borderZ !== '' ? Number(borderZ) : null,
      checkpointDistance: checkpointDistance ? Number(checkpointDistance) : Number(process.env.CHECKPOINT_DISTANCE || 1000)
    })

    bot.on('error', (err) => emitLog('เชื่อมต่อผิดพลาด: ' + err.message))
    bot.on('kicked', (reason) => emitLog('ถูกเตะออกจากเซิร์ฟเวอร์: ' + reason))
    bot.on('end', () => {
      emitLog('การเชื่อมต่อสิ้นสุดลง')
      bot = null
      controller = null
    })

    emitLog(`กำลังเชื่อมต่อไปยัง ${host}:${port} (เวอร์ชัน ${version || 'auto'}) ในชื่อ ${username || 'Fizzy14'}`)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/disconnect', (req, res) => {
  if (!bot) return res.status(400).json({ error: 'ไม่มีบอทที่เชื่อมต่ออยู่' })
  if (controller) controller.stop()
  bot.quit()
  bot = null
  controller = null
  emitLog('ตัดการเชื่อมต่อบอทแล้ว')
  res.json({ ok: true })
})

app.get('/api/status', (req, res) => {
  if (!bot || !bot.entity) return res.json({ connected: false })
  res.json({
    connected: true,
    position: bot.entity.position,
    health: bot.health,
    food: bot.food,
    state: controller ? controller.state : null,
    skin: currentSkin
  })
})

app.post('/api/skin', (req, res) => {
  // See bot/createBot.js note: actually changing the rendered skin needs a
  // premium Microsoft account or a server-side skin plugin. This endpoint
  // just stores the reference shown in the GUI.
  currentSkin = req.body.skin || null
  emitLog('ตั้งค่าลิงก์สกินไว้แล้ว (ต้องใช้บัญชี Microsoft หรือปลั๊กอินสกินฝั่งเซิร์ฟเวอร์เพื่อให้ขึ้นจริง)')
  res.json({ ok: true, skin: currentSkin })
})

// "Go Live" — this only works if OBS (running the REAL game client + BSL
// shader + your overlay as a Browser Source) is reachable at the given
// obs-websocket address. See baritone/README_part2.md for that setup.
app.post('/api/golive', async (req, res) => {
  try {
    const { obsHost, obsPort, obsPassword } = req.body
    await goLiveOnOBS({
      host: obsHost || process.env.OBS_HOST,
      port: obsPort || process.env.OBS_PORT,
      password: obsPassword || process.env.OBS_PASSWORD
    })
    emitLog('สั่ง OBS เริ่ม Live แล้ว')
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: 'สั่ง OBS ไม่สำเร็จ: ' + err.message })
  }
})

app.post('/api/stoplive', async (req, res) => {
  try {
    const { obsHost, obsPort, obsPassword } = req.body
    await stopLiveOnOBS({
      host: obsHost || process.env.OBS_HOST,
      port: obsPort || process.env.OBS_PORT,
      password: obsPassword || process.env.OBS_PASSWORD
    })
    emitLog('สั่ง OBS หยุด Live แล้ว')
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: 'สั่งหยุด OBS ไม่สำเร็จ: ' + err.message })
  }
})

// One-click: create a YouTube live broadcast via API v3, hand the RTMP
// details straight to OBS, start streaming, and go live on YouTube.
app.post('/api/youtube/golive', async (req, res) => {
  try {
    const { title, description, privacyStatus, obsHost, obsPort, obsPassword } = req.body

    emitLog('กำลังสร้าง YouTube Live broadcast ผ่าน API v3...')
    const { broadcastId, rtmpUrl, streamKey, watchUrl } = await createBroadcastAndStream({
      title, description, privacyStatus
    })
    currentBroadcastId = broadcastId
    emitLog(`สร้าง broadcast แล้ว: ${watchUrl}`)

    emitLog('กำลังตั้ง stream key ให้ OBS แล้วสั่ง Start Stream...')
    await setStreamKeyAndGoLive(
      { host: obsHost || process.env.OBS_HOST, port: obsPort || process.env.OBS_PORT, password: obsPassword || process.env.OBS_PASSWORD },
      { rtmpUrl, streamKey }
    )

    // Give OBS a few seconds to actually connect to YouTube's ingest server
    // before telling YouTube to transition the broadcast to "live".
    emitLog('รอให้ OBS เชื่อมต่อสัญญาณเข้า YouTube (~10 วิ) ก่อน transition เป็น live...')
    await new Promise((r) => setTimeout(r, 10000))
    await transitionBroadcast(broadcastId, 'live')

    emitLog(`🔴 ไลฟ์แล้ว: ${watchUrl}`)
    res.json({ ok: true, watchUrl, broadcastId })
  } catch (err) {
    emitLog('YouTube Go Live ผิดพลาด: ' + err.message)
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/youtube/stop', async (req, res) => {
  try {
    const { obsHost, obsPort, obsPassword } = req.body
    if (currentBroadcastId) {
      await transitionBroadcast(currentBroadcastId, 'complete')
      emitLog('จบ YouTube broadcast แล้ว')
      currentBroadcastId = null
    }
    await stopLiveOnOBS({ host: obsHost || process.env.OBS_HOST, port: obsPort || process.env.OBS_PORT, password: obsPassword || process.env.OBS_PASSWORD })
    res.json({ ok: true })
  } catch (err) {
    emitLog('หยุดไลฟ์ผิดพลาด: ' + err.message)
    res.status(500).json({ error: err.message })
  }
})

const PORT = process.env.PORT || 3000
server.listen(PORT, () => console.log(`Fizzy14 control panel running on http://localhost:${PORT}`))
