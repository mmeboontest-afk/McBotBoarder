const { Movements, goals } = require('mineflayer-pathfinder')
const { GoalNear, GoalXZ, GoalBlock, GoalFollow } = goals

const STATE = {
  FARM_EARLY: 'FARM_EARLY',
  TRAVEL: 'TRAVEL',
  INVESTIGATE: 'INVESTIGATE',
  COMBAT: 'COMBAT',
  RECOVER_ITEMS: 'RECOVER_ITEMS',
  DEAD: 'DEAD',
  REACHED_BORDER: 'REACHED_BORDER'
}

// North in Minecraft = decreasing Z.
const NORTH_STEP = -64 // how far ahead to path each travel tick before re-evaluating

class BotController {
  constructor(bot, opts = {}) {
    this.bot = bot
    this.state = STATE.FARM_EARLY
    this.checkpointDistance = opts.checkpointDistance || 1000
    this.borderZ = opts.borderZ ?? null // if the server doesn't expose a real border, set manually from GUI
    this.log = opts.onLog || (() => {})
    this.onState = opts.onState || (() => {})
    this._deathPos = null
    this._lastCheckpointZ = null
    this._running = false
    this._investigateCooldownUntil = 0
    this._setupEvents()
  }

  _setState(s) {
    this.state = s
    this.onState(s)
  }

  _setupEvents() {
    const bot = this.bot

    bot.once('spawn', () => {
      const mcData = require('minecraft-data')(bot.version)
      const movements = new Movements(bot, mcData)
      movements.canDig = true
      movements.allowSprinting = true
      bot.pathfinder.setMovements(movements)
      this._lastCheckpointZ = bot.entity.position.z
      this.log('เกิดในโลกแล้ว เริ่มช่วงฟาร์ม/คราฟของเริ่มต้น')
      this._running = true
      this._loop()
    })

    bot.on('death', () => {
      this._deathPos = bot.entity.position.clone()
      this._setState(STATE.DEAD)
      this.log(`บอทตายที่ ${this._fmt(this._deathPos)} — รอ respawn เพื่อไปเก็บของคืน`)
    })

    bot.on('respawn', () => {
      if (this._deathPos) {
        this._setState(STATE.RECOVER_ITEMS)
        this.log('Respawn แล้ว กำลังวิ่งกลับไปเก็บไอเทมที่จุดตาย')
      }
    })

    bot.on('health', () => {
      if (bot.health !== undefined && bot.health <= 6 && this.state !== STATE.COMBAT) {
        // Low health outside combat: try to eat / retreat handled by auto-eat plugin.
      }
    })

    bot.on('physicsTick', () => {
      // Keep sprint+jump "run" style movement while travelling, per requirement.
      if (this.state === STATE.TRAVEL && bot.pathfinder.isMoving()) {
        bot.setControlState('sprint', true)
      }
    })
  }

  _fmt(pos) {
    return `${Math.round(pos.x)}, ${Math.round(pos.y)}, ${Math.round(pos.z)}`
  }

  async _sleep(ms) {
    return new Promise((r) => setTimeout(r, ms))
  }

  async _loop() {
    while (this._running) {
      try {
        switch (this.state) {
          case STATE.FARM_EARLY:
            await this._farmEarly()
            this._setState(STATE.TRAVEL)
            break
          case STATE.TRAVEL:
            await this._travelTick()
            break
          case STATE.INVESTIGATE:
            await this._investigateTick()
            break
          case STATE.COMBAT:
            await this._combatTick()
            break
          case STATE.RECOVER_ITEMS:
            await this._recoverItemsTick()
            break
          case STATE.DEAD:
            await this._sleep(1000)
            break
          case STATE.REACHED_BORDER:
            this.log('ถึง World Border แล้ว หยุดรอคำสั่งถัดไป')
            return
        }
      } catch (err) {
        this.log('เกิดข้อผิดพลาดในลูปหลัก: ' + err.message)
        await this._sleep(1000)
      }
      await this._sleep(300)
    }
  }

  // ---- Phase 1: get a wooden/stone kit, a sword, and a bed before travelling ----
  async _farmEarly() {
    const bot = this.bot
    const mcData = require('minecraft-data')(bot.version)

    try {
      // 1. Get wood
      this.log('กำลังหาต้นไม้เพื่อตัดไม้...')
      await this._collectNearby(['oak_log', 'birch_log', 'spruce_log', 'dark_oak_log', 'jungle_log', 'acacia_log'], 8)

      // 2. Craft table + basic tools if we have a recipe & materials
      await this._craftIfPossible('crafting_table', 1)
      const table = bot.findBlock({ matching: mcData.blocksByName.crafting_table?.id, maxDistance: 16 })
      if (table) {
        await bot.pathfinder.goto(new GoalNear(table.position.x, table.position.y, table.position.z, 1)).catch(() => {})
      }

      await this._craftIfPossible('wooden_pickaxe', 1)
      await this._craftIfPossible('wooden_sword', 1)

      // 3. Mine stone for a stone sword/pickaxe (better sword before travelling long distance)
      this.log('กำลังขุดหินเพื่อทำเครื่องมือ/ดาบหิน...')
      await this._collectNearby(['stone', 'cobblestone'], 10)
      await this._craftIfPossible('stone_pickaxe', 1)
      await this._craftIfPossible('stone_sword', 1)

      // 4. Get wool (kill/shear sheep) for a bed — falls back to punching sheep if no shears
      this.log('กำลังหาแกะเพื่อเอาขนสำหรับทำเตียง...')
      await this._getWoolForBed()
      await this._craftIfPossible('white_bed', 1) // color may vary based on wool collected

      this.log('จบช่วงเตรียมของเบื้องต้น เริ่มเดินทางไปทิศเหนือ')
    } catch (err) {
      this.log('ฟาร์มช่วงแรกไม่สำเร็จทั้งหมด (' + err.message + ') แต่จะเดินทางต่อ')
    }
  }

  async _collectNearby(blockNames, count) {
    const bot = this.bot
    const mcData = require('minecraft-data')(bot.version)
    const ids = blockNames.map((n) => mcData.blocksByName[n]?.id).filter(Boolean)
    if (!ids.length) return
    for (let i = 0; i < count; i++) {
      const block = bot.findBlock({ matching: (b) => ids.includes(b.type), maxDistance: 32 })
      if (!block) break
      try {
        await bot.collectBlock.collect(block)
      } catch (e) {
        break
      }
    }
  }

  async _craftIfPossible(itemName, amount) {
    const bot = this.bot
    const mcData = require('minecraft-data')(bot.version)
    const item = mcData.itemsByName[itemName]
    if (!item) return false
    const table = bot.findBlock({ matching: mcData.blocksByName.crafting_table?.id, maxDistance: 16 })
    const recipe = bot.recipesFor(item.id, null, 1, table || null)[0]
    if (!recipe) return false
    try {
      await bot.craft(recipe, amount, table || null)
      this.log(`คราฟ ${itemName} สำเร็จ`)
      return true
    } catch (e) {
      return false
    }
  }

  async _getWoolForBed() {
    const bot = this.bot
    const sheep = Object.values(bot.entities).find((e) => e.name === 'sheep')
    if (!sheep) return
    await bot.pathfinder.goto(new GoalFollow(sheep, 1)).catch(() => {})
    // Shear if we have shears, else attack (drops wool on death too)
    const shears = bot.inventory.items().find((i) => i.name === 'shears')
    if (shears) {
      try {
        await bot.equip(shears, 'hand')
        await bot.useOn(sheep)
      } catch (e) {}
    } else {
      try {
        await bot.pvp.attack(sheep)
      } catch (e) {}
    }
  }

  // ---- Phase 2: head north toward the world border, checkpointing every N blocks ----
  async _travelTick() {
    const bot = this.bot
    const pos = bot.entity.position

    // Hostile nearby? switch to combat.
    const hostile = this._findHostile()
    if (hostile) {
      this._setState(STATE.COMBAT)
      return
    }

    // Reached the border?
    const border = this._getBorderZ()
    if (border !== null && pos.z <= border + 8) {
      this._setState(STATE.REACHED_BORDER)
      return
    }

    // Checkpoint every `checkpointDistance` blocks travelled north.
    if (this._lastCheckpointZ - pos.z >= this.checkpointDistance) {
      await this._placeCheckpointBed()
      this._lastCheckpointZ = pos.z
    }

    // Something interesting nearby worth a detour? (ore, chest, village-ish structures)
    const poi = this._findPointOfInterest()
    if (poi && Date.now() > this._investigateCooldownUntil) {
      this._pendingPOI = poi
      this._setState(STATE.INVESTIGATE)
      return
    }

    // Otherwise keep walking north in chunks, running + occasionally jumping.
    const targetZ = Math.max(pos.z - Math.abs(NORTH_STEP), border ?? -30000000)
    const goal = new GoalXZ(pos.x, targetZ)
    bot.setControlState('sprint', true)
    this._bunnyHop()
    await bot.pathfinder.goto(goal).catch((e) => {
      this.log('เดินทางติดขัด: ' + e.message)
    })
  }

  _bunnyHop() {
    const bot = this.bot
    if (this._hopInterval) return
    this._hopInterval = setInterval(() => {
      if (this.state !== STATE.TRAVEL) return
      bot.setControlState('jump', true)
      setTimeout(() => bot.setControlState('jump', false), 150)
    }, 900)
  }

  _findHostile() {
    const bot = this.bot
    return Object.values(bot.entities).find(
      (e) => e.kind === 'Hostile mobs' && e.position.distanceTo(bot.entity.position) < 12
    )
  }

  _findPointOfInterest() {
    const bot = this.bot
    const mcData = require('minecraft-data')(bot.version)
    const interestingOres = ['diamond_ore', 'deepslate_diamond_ore', 'iron_ore', 'ancient_debris', 'emerald_ore']
    const ids = interestingOres.map((n) => mcData.blocksByName[n]?.id).filter(Boolean)
    const oreBlock = bot.findBlock({ matching: (b) => ids.includes(b.type), maxDistance: 24 })
    if (oreBlock) return { type: 'ore', block: oreBlock }

    const chestId = mcData.blocksByName.chest?.id
    const chest = chestId ? bot.findBlock({ matching: chestId, maxDistance: 24 }) : null
    if (chest) return { type: 'chest', block: chest }

    return null
  }

  async _investigateTick() {
    const bot = this.bot
    const poi = this._pendingPOI
    this._pendingPOI = null
    this._investigateCooldownUntil = Date.now() + 15000
    if (!poi) {
      this._setState(STATE.TRAVEL)
      return
    }
    this.log(`เจอ ${poi.type === 'ore' ? 'แร่' : 'หีบ'} ระหว่างทาง แวะเก็บก่อน`)
    try {
      const b = poi.block
      await bot.pathfinder.goto(new GoalNear(b.position.x, b.position.y, b.position.z, 1))
      if (poi.type === 'ore') {
        await bot.collectBlock.collect(b)
      } else {
        const chest = await bot.openContainer(b)
        const items = chest.containerItems()
        for (const it of items) {
          try { await chest.withdraw(it.type, null, it.count) } catch (e) {}
        }
        chest.close()
      }
    } catch (e) {
      this.log('เก็บของระหว่างทางไม่สำเร็จ: ' + e.message)
    }
    this._setState(STATE.TRAVEL)
  }

  async _combatTick() {
    const bot = this.bot
    const hostile = this._findHostile()
    if (!hostile) {
      this._setState(STATE.TRAVEL)
      return
    }
    // Equip best sword (Java-style combat: mineflayer-pvp handles attack cooldown/timing).
    const sword = bot.inventory
      .items()
      .filter((i) => i.name.endsWith('_sword'))
      .sort((a, b) => this._swordRank(b.name) - this._swordRank(a.name))[0]
    if (sword) {
      try { await bot.equip(sword, 'hand') } catch (e) {}
    }
    try {
      bot.pvp.attack(hostile)
    } catch (e) {}
    await this._sleep(400)
    if (!this._findHostile()) {
      try { bot.pvp.stop() } catch (e) {}
      this._setState(STATE.TRAVEL)
    }
  }

  _swordRank(name) {
    const order = ['wooden_sword', 'stone_sword', 'golden_sword', 'iron_sword', 'diamond_sword', 'netherite_sword']
    return order.indexOf(name)
  }

  async _recoverItemsTick() {
    const bot = this.bot
    if (!this._deathPos) {
      this._setState(STATE.TRAVEL)
      return
    }
    this.log(`วิ่งกลับไปเก็บของที่ ${this._fmt(this._deathPos)}`)
    bot.setControlState('sprint', true)
    try {
      await bot.pathfinder.goto(new GoalNear(this._deathPos.x, this._deathPos.y, this._deathPos.z, 1))
      // Pick up any items dropped nearby (mineflayer auto-collects on walk-over).
      await this._sleep(1500)
      this.log('เก็บของที่จุดตายเสร็จแล้ว กลับไปเดินทางต่อ')
    } catch (e) {
      this.log('หาทางกลับไปจุดตายไม่ได้: ' + e.message)
    }
    this._deathPos = null
    this._setState(STATE.TRAVEL)
  }

  // ---- Checkpointing: place a bed and set spawn every `checkpointDistance` blocks ----
  async _placeCheckpointBed() {
    const bot = this.bot
    const bed = bot.inventory.items().find((i) => i.name.endsWith('_bed'))
    this.log('ถึงระยะเช็คพอยต์ (ทุก ' + this.checkpointDistance + ' บล็อก) — วางเตียงเพื่อเซฟจุดเกิด')
    if (!bed) {
      this.log('ไม่มีเตียงในกระเป๋า ข้ามการวางเตียงรอบนี้')
      return
    }
    try {
      await bot.equip(bed, 'hand')
      const groundBlock = bot.blockAt(bot.entity.position.offset(0, -1, 0))
      const refBlock = bot.blockAt(bot.entity.position.offset(1, -1, 0))
      if (groundBlock) {
        await bot.placeBlock(groundBlock, { x: 0, y: 1, z: 0 })
        await this._sleep(300)
        const placedBed = bot.findBlock({ matching: (b) => b.name.endsWith('_bed'), maxDistance: 3 })
        if (placedBed) {
          await bot.sleep(placedBed).catch(() => {})
          await this._sleep(500)
          try { bot.wake && (await bot.wake()) } catch (e) {}
        }
      }
      this.log('วางเตียง + ตั้งจุดเกิดใหม่เรียบร้อย')
    } catch (e) {
      this.log('วางเตียงไม่สำเร็จ: ' + e.message)
    }
  }

  _getBorderZ() {
    const bot = this.bot
    if (this.borderZ !== null && this.borderZ !== undefined) return this.borderZ
    // Some mineflayer versions expose a tracked world border via packets.
    if (bot.worldBorder && typeof bot.worldBorder.z === 'number') {
      const half = (bot.worldBorder.diameter || 60000000) / 2
      return bot.worldBorder.z - half // north edge
    }
    return null // unknown — caller falls back to vanilla max
  }

  stop() {
    this._running = false
    if (this._hopInterval) clearInterval(this._hopInterval)
  }
}

module.exports = { BotController, STATE }
