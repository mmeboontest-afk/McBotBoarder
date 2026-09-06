const OBSWebSocket = require('obs-websocket-js').default

/**
 * Requires OBS Studio (v28+) with the built-in obs-websocket server enabled
 * (Tools > WebSocket Server Settings), running on the SAME machine that is
 * actually rendering Minecraft with the BSL shader + your overlay browser
 * source. This project's Node bot does not render graphics, so it cannot be
 * the thing OBS captures — see baritone/README_part2.md.
 */
async function connect({ host = '127.0.0.1', port = 4455, password = '' }) {
  const obs = new OBSWebSocket()
  await obs.connect(`ws://${host}:${port}`, password || undefined)
  return obs
}

async function goLiveOnOBS(opts) {
  const obs = await connect(opts)
  try {
    await obs.call('StartStream')
  } finally {
    obs.disconnect()
  }
}

async function stopLiveOnOBS(opts) {
  const obs = await connect(opts)
  try {
    await obs.call('StopStream')
  } finally {
    obs.disconnect()
  }
}

/**
 * Points OBS at a given RTMP URL + stream key (e.g. from the YouTube Data
 * API v3 flow in youtube/ytApi.js) and starts streaming.
 */
async function setStreamKeyAndGoLive(opts, { rtmpUrl, streamKey }) {
  const obs = await connect(opts)
  try {
    await obs.call('SetStreamServiceSettings', {
      streamServiceType: 'rtmp_custom',
      streamServiceSettings: {
        server: rtmpUrl,
        key: streamKey
      }
    })
    await obs.call('StartStream')
  } finally {
    obs.disconnect()
  }
}

module.exports = { goLiveOnOBS, stopLiveOnOBS, setStreamKeyAndGoLive }
