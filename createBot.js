const mineflayer = require('mineflayer')
const { pathfinder } = require('mineflayer-pathfinder')
const { plugin: pvp } = require('mineflayer-pvp')
const autoEatPlugin = require('mineflayer-auto-eat').plugin
const collectBlock = require('mineflayer-collectblock').plugin
const armorManager = require('mineflayer-armor-manager')

/**
 * Creates a mineflayer bot connected to a Java Edition server.
 *
 * NOTE ON SKINS: mineflayer connects as an offline/"cracked" account by
 * default, which has no skin-upload capability in the protocol. To make
 * Fizzy14 actually show a chosen skin you need EITHER:
 *   1) A real Microsoft account (set auth: 'microsoft' below) that already
 *      has that skin equipped on minecraft.net, or
 *   2) A server-side plugin (e.g. a skin/cape plugin on the server) that
 *      assigns skins by username.
 * The `skinUrl` option here is only stored/echoed to the GUI for reference.
 */
function createBot({ host, port, version, username, auth }) {
  const bot = mineflayer.createBot({
    host,
    port: port ? Number(port) : 25565,
    version: version || false, // false = auto-detect
    username: username || 'Fizzy14',
    auth: auth || 'offline'
  })

  bot.loadPlugin(pathfinder)
  bot.loadPlugin(pvp)
  bot.loadPlugin(autoEatPlugin)
  bot.loadPlugin(collectBlock)
  bot.loadPlugin(armorManager)

  bot.once('spawn', () => {
    if (bot.autoEat) {
      bot.autoEat.options = {
        priority: 'foodPoints',
        startAt: 16,
        bannedFood: []
      }
    }
  })

  // Never chat, per requirement — strip any accidental outbound chat calls
  // from third-party plugins by no-op'ing bot.chat if you want to be 100%
  // silent even on server messages that plugins might auto-reply to.
  // bot.chat = () => {}

  return bot
}

module.exports = { createBot }
