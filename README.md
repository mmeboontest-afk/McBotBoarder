# Fizzy14 — Minecraft Java Bot + Web Control Panel

โปรเจกต์นี้แบ่งเป็น 2 ส่วนตามที่คุยกันไว้:

## ส่วนที่ 1 — บอทอัตโนมัติ + เว็บ GUI (รันบน Render ได้จริง)
- `bot/createBot.js` — สร้างบอท mineflayer ต่อเซิร์ฟเวอร์ Java ด้วย IP/Port/เวอร์ชัน/ชื่อ
- `bot/behavior.js` — ตรรกะหลัก: ฟาร์ม/คราฟดาบ-เตียงช่วงแรก → เดินทิศเหนือ → แวะเก็บของถ้าน่าสนใจ →
  วางเตียง+เซฟจุดเกิดทุก 1000 บล็อก → ถ้าตายวิ่งกลับไปเก็บของ → หยุดเมื่อถึง world border
- `server.js` — เว็บเซิร์ฟเวอร์ (Express + Socket.io) ให้ GUI คุยกับบอท ผ่าน `public/index.html`
- `obs/obsControl.js` — ตั้ง stream key ให้ OBS อัตโนมัติจาก YouTube API แล้วสั่ง Start
- `youtube/ytApi.js` — เรียก YouTube Data API v3: สร้าง broadcast, สร้าง stream, bind, transition เป็น live
- ปุ่ม "🔴 กด Live" ในเว็บทำทุกอย่างในขั้นตอนเดียว: สร้าง broadcast → ตั้ง key ให้ OBS → Start Stream → transition เป็น live

### วิธีรันเอง
```bash
cp .env.example .env   # แก้ค่าตามต้องการ
npm install
npm start
# เปิด http://localhost:3000
```

### วิธี deploy บน Render
1. Push โฟลเดอร์นี้ขึ้น GitHub repo
2. บน Render: New > Web Service > เลือก repo นี้ (จะอ่าน `render.yaml` ให้อัตโนมัติ)
3. รอ build เสร็จแล้วเปิดลิงก์ที่ Render ให้มา → นี่คือหน้า GUI ของ Fizzy14

### ข้อจำกัดที่ควรรู้ (สำคัญ)
- **สกิน**: บอทที่ต่อแบบ offline/cracked เปลี่ยนสกินเองไม่ได้ในระดับโปรโตคอล ต้องใช้บัญชี Microsoft
  จริงที่ตั้งสกินไว้แล้ว (เลือก Auth = Microsoft ใน GUI) หรือให้เซิร์ฟเวอร์มีปลั๊กอินสกิน
- **ภาพ/Texture/Shader**: บอทตัวนี้ไม่มีการ render กราฟิกเลย ช่อง "สถานะบอท" ในเว็บโชว์แค่
  ตัวเลขตำแหน่ง/HP/ไอเทม ไม่ใช่ภาพเกม การไลฟ์ภาพจริงพร้อม BSL shader ต้องทำตามส่วนที่ 2
- **World Border**: บางเซิร์ฟเวอร์ไม่ส่งค่า border จริงผ่านโปรโตคอล ถ้า `bot.worldBorder` ไม่มีค่า
  ให้กรอกพิกัด Z ของ border เองในช่อง "World Border Z" ของ GUI
- ยังไม่ได้ทดสอบกับเซิร์ฟเวอร์จริง (สภาพแวดล้อมนี้ไม่มีอินเทอร์เน็ตให้ทดสอบ) — โครงสร้าง/ตรรกะถูกต้อง
  ตาม API ของ mineflayer แต่ควรทดลองรันกับเซิร์ฟเวอร์ทดสอบก่อนใช้จริง โดยเฉพาะการคราฟ/วางเตียง
  ที่ recipe/ไอดีบล็อกอาจต่างกันไปตามเวอร์ชัน

## ส่วนที่ 2 — ไลฟ์ภาพเกมจริงพร้อม Shader (ต้องรันบนเครื่องมี GPU)
ดู `baritone/README_part2.md` — ครอบคลุมการติดตั้ง Iris + BSL shader, Baritone (ตัวเดิน/ขุด/ฟาร์มในเกมจริง),
การตั้งมุมกล้อง F5/มุมมองที่ 1, การตั้ง OBS + overlay (`pastel_dream_stream_overlay.html`) และการเชื่อม
ปุ่ม "Go Live" บนเว็บ GUI เข้ากับ OBS ของคุณ
