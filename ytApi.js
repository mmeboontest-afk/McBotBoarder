const { google } = require('googleapis')

function getAuthedClient() {
  const { YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REDIRECT_URI, YOUTUBE_REFRESH_TOKEN } = process.env
  if (!YOUTUBE_CLIENT_ID || !YOUTUBE_CLIENT_SECRET || !YOUTUBE_REFRESH_TOKEN) {
    throw new Error('ยังไม่ได้ตั้งค่า YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET / YOUTUBE_REFRESH_TOKEN ใน .env')
  }
  const oauth2Client = new google.auth.OAuth2(YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REDIRECT_URI)
  oauth2Client.setCredentials({ refresh_token: YOUTUBE_REFRESH_TOKEN })
  return google.youtube({ version: 'v3', auth: oauth2Client })
}

/**
 * Full one-click flow:
 *  1. Create a liveBroadcast (the "video" that will go live)
 *  2. Create a liveStream (this is what actually gives us the RTMP ingest
 *     URL + stream key/name that OBS needs)
 *  3. Bind them together
 *  4. Return the RTMP details so the caller can hand them to OBS
 *     (see obs/obsControl.js -> setStreamKeyAndGoLive)
 */
async function createBroadcastAndStream({ title, description, privacyStatus = 'public' }) {
  const youtube = getAuthedClient()

  const broadcastRes = await youtube.liveBroadcasts.insert({
    part: ['snippet', 'status', 'contentDetails'],
    requestBody: {
      snippet: {
        title: title || `Fizzy14 เดินทางไป World Border`,
        description: description || 'Live ไปกับ Fizzy14 บอท Minecraft ที่กำลังมุ่งหน้าไปยัง World Border',
        scheduledStartTime: new Date().toISOString()
      },
      status: { privacyStatus, selfDeclaredMadeForKids: false },
      contentDetails: {
        enableAutoStart: true,
        enableAutoStop: true,
        latencyPreference: 'low'
      }
    }
  })

  const streamRes = await youtube.liveStreams.insert({
    part: ['snippet', 'cdn'],
    requestBody: {
      snippet: { title: title || 'Fizzy14 stream' },
      cdn: {
        frameRate: 'variable',
        ingestionType: 'rtmp',
        resolution: 'variable'
      }
    }
  })

  await youtube.liveBroadcasts.bind({
    id: broadcastRes.data.id,
    part: ['id'],
    streamId: streamRes.data.id
  })

  const ingestion = streamRes.data.cdn.ingestionInfo

  return {
    broadcastId: broadcastRes.data.id,
    streamId: streamRes.data.id,
    rtmpUrl: ingestion.ingestionAddress, // e.g. rtmp://a.rtmp.youtube.com/live2
    streamKey: ingestion.streamName,
    watchUrl: `https://youtube.com/watch?v=${broadcastRes.data.id}`
  }
}

async function transitionBroadcast(broadcastId, status) {
  // status: 'testing' | 'live' | 'complete'
  const youtube = getAuthedClient()
  await youtube.liveBroadcasts.transition({
    id: broadcastId,
    broadcastStatus: status,
    part: ['id', 'status']
  })
}

module.exports = { createBroadcastAndStream, transitionBroadcast }
