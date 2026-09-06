require('dotenv').config()
const path = require('path')
const express = require('express')
const http = require('http')
const { Server } = require('socket.io')
const { google } = require('googleapis')
const { createBot } = require('./createBot')
const { BotController } = require('./behavior')
const { stopLiveOnOBS, setStreamKeyAndGoLive } = require('./obsControl')
const { createBroadcastAndStream, transitionBroadcast } = require('./ytApi')

const app = express()
const server = http.createServer(app)
const io = new Server(server)

app.use(express.json())

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')))
app.get('/app.js', (req, res) => res.sendFile(path.join(__dirname, 'app.js')))
app.get('/style.css', (req, res) => res.sendFile(path.join(__dirname, 'style.css')))

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
  currentSkin = req.body.skin || null
  emitLog('ตั้งค่าลิงก์สกินไว้แล้ว (ต้องใช้บัญชี Microsoft หรือปลั๊กอินสกินฝั่งเซิร์ฟเวอร์เพื่อให้ขึ้นจริง)')
  res.json({ ok: true, skin: currentSkin })
})

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

function buildOAuthClient() {
  const { YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REDIRECT_URI } = process.env
  if (!YOUTUBE_CLIENT_ID || !YOUTUBE_CLIENT_SECRET || !YOUTUBE_REDIRECT_URI) {
    throw new Error('ยังไม่ได้ตั้งค่า YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET / YOUTUBE_REDIRECT_URI ใน Render Environment Variables')
  }
  return new google.auth.OAuth2(YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REDIRECT_URI)
}

app.get('/auth/youtube', (req, res) => {
  try {
    const oauth2Client = buildOAuthClient()
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/youtube']
    })
    res.redirect(url)
  } catch (err) {
    res.status(500).send('ผิดพลาด: ' + err.message)
  }
})

app.get('/oauth2callback', async (req, res) => {
  try {
    const oauth2Client = buildOAuthClient()
    const { tokens } = await oauth2Client.getToken(req.query.code)
    if (!tokens.refresh_token) {
      return res.send(`
        <h2>ไม่ได้ refresh_token กลับมา</h2>
        <p>มักเกิดเพราะเคย Allow แอปนี้ไปแล้วรอบก่อน ให้ไปที่
        <a href="https://myaccount.google.com/permissions" target="_blank">myaccount.google.com/permissions</a>
        เพิกถอนสิทธิ์แอปนี้ก่อน แล้วกลับไปเปิด <a href="/auth/youtube">/auth/youtube</a> ใหม่อีกครั้ง</p>
      `)
    }
    process.env.YOUTUBE_REFRESH_TOKEN = tokens.refresh_token
    emitLog('ได้ YouTube Refresh Token แล้ว ใช้งานได้ทันทีในรอบนี้')
    res.send(`
      <html><body style="font-family:sans-serif;max-width:640px;margin:40px auto;line-height:1.6">
        <h2>✅ สำเร็จ!</h2>
        <p>เอาค่านี้ไปใส่ใน Render → service ของคุณ → <b>Environment</b> →
        เพิ่มตัวแปรชื่อ <code>YOUTUBE_REFRESH_TOKEN</code> แล้ววางค่านี้:</p>
        <textarea style="width:100%;height:80px;font-family:monospace;padding:8px">${tokens.refresh_token}</textarea>
        <p>บันทึกแล้ว Render จะ restart service ให้เอง (หรือกด Manual Deploy ถ้าไม่ auto)
        จากนั้นกลับไปหน้า control panel กด Live ได้เลย — ไม่ต้องเปิดหน้านี้อีกแล้ว</p>
      </body></html>
    `)
  } catch (err) {
    res.status(500).send('แลก token ไม่สำเร็จ: ' + err.message)
  }
})

const PORT = process.env.PORT || 3000
server.listen(PORT, () => console.log(`Fizzy14 control panel running on http://localhost:${PORT}`))
