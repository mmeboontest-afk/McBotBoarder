# ส่วนที่ 2: ไลฟ์ภาพเกมจริงพร้อม BSL Shader (รันบนเครื่องที่มี GPU)

บอท mineflayer ในโปรเจกต์นี้ **ไม่มีภาพกราฟิก** ให้จับสตรีม เพราะมันคุยแค่โปรโตคอลเน็ตเวิร์กกับเซิร์ฟเวอร์
ถ้าต้องการภาพเกมจริง + shader BSL + overlay ของคุณ ต้องรันเกม Minecraft ตัวจริงบนเครื่องที่มีจอ/GPU
(พีซีคุณเอง หรือ GPU cloud VPS เช่น Paperspace / Shadow) ตามขั้นตอนนี้:

## 1. ติดตั้งเกม + shader
1. ติดตั้ง Minecraft Java Edition เวอร์ชันเดียวกับเซิร์ฟเวอร์
2. ติดตั้ง **Iris** (หรือ OptiFine ถ้าเซิร์ฟเวอร์/เวอร์ชันรองรับ) เพื่อให้ใช้ shader ได้
3. เอาไฟล์ `BSL_v10_1_5.zip` ที่คุณส่งมาวางใน `.minecraft/shaderpacks/` แล้วเลือกใช้งานในเมนู Video Settings > Shaders

## 2. ติดตั้ง Baritone (ตัวเดินอัตโนมัติ/auto-mine/auto-farm ในเกมจริง)
1. ติดตั้ง Fabric หรือ Forge ตามที่ Baritone รุ่นนั้นรองรับ แล้วใส่ Baritone mod jar
2. เข้าเกม เปิดแชท พิมพ์คำสั่ง Baritone (ขึ้นต้นด้วย `#`) เช่น:
   - `#goal ~ ~ -30000000` → ตั้งเป้าหมายไปทาง Z ติดลบมาก ๆ (ทิศเหนือ) ใกล้ world border ฝั่งเหนือ
     ปรับตัวเลขให้ตรงกับ world border จริงของเซิร์ฟเวอร์คุณ (เช็คด้วยคำสั่ง `/worldborder get` ถ้าเซิร์ฟเวอร์อนุญาต)
   - `#path` → เริ่มเดินไปยังเป้าหมาย
   - `#mine diamond_ore` → ให้ขุดแร่ที่เจอระหว่างทาง
   - `#chest` → เก็บของจากหีบใกล้เคียง
   - `#stop` → หยุดการทำงานของ Baritone
3. ตั้งค่า Baritone (`#set` commands) เช่น `#set allowSprint true`, `#set allowPlace true`
   ให้ตรงกับสไตล์ "วิ่ง+กระโดด, วางบล็อกได้" ตามที่ต้องการ

## 3. มุมมองกล้อง (F5 / มุมมองที่ 1)
Baritone ไม่คุมมุมกล้อง ต้องทำเอง/ใช้สคริปต์ auto-hotkey หรือปุ่มลัดในเกม:
- ปกติ (เดินทาง/สำรวจ): กด **F5** เพื่อสลับมุมมองบุคคลที่ 3 มองข้างหลัง (ตามที่ขอ)
- ระหว่างต่อสู้: กด **F5** อีกครั้ง (หรือ F5 ค้าง) กลับไปมุมมองบุคคลที่ 1 เพื่อความแม่นยำ
- ถ้าต้องการอัตโนมัติ ใช้ AutoHotkey เฝ้าดู log ไฟล์เกม หรือเขียนม็อดเสริมที่ hook เข้ากับ event ถูกโจมตี/กำลังโจมตี แล้วส่งปุ่ม F5 ให้เอง

## 4. ตั้งค่า OBS + Overlay
1. เปิด OBS Studio (v28 ขึ้นไป) → Tools > WebSocket Server Settings → เปิดใช้งาน ตั้ง Port/Password
   ให้ตรงกับที่กรอกในเว็บ GUI (ส่วนที่ 3 "ไลฟ์สด")
2. เพิ่ม Source: **Game Capture** หรือ **Display Capture** จับหน้าจอ Minecraft ที่มี shader เปิดอยู่
3. เพิ่ม Source: **Browser Source** ชี้ไปที่ไฟล์ `pastel_dream_stream_overlay.html` ของคุณ
   (วางไฟล์ในเครื่องแล้วใส่ path แบบ `file:///C:/path/to/pastel_dream_stream_overlay.html`)
   ตั้ง background เป็นโปร่งใส (ไฟล์นี้ตั้งไว้ให้แล้ว) เพื่อให้ทับภาพเกมได้พอดี
4. ตั้งค่า YouTube: Settings > Stream > ใส่ Stream Key จากช่อง YouTube ของคุณ
5. เมื่อกด "Live" บนเว็บ GUI ระบบจะยิง `StartStream` ไปที่ OBS ผ่าน obs-websocket ให้อัตโนมัติ
   (เว็บ GUI ต้องเข้าถึง OBS WebSocket ของเครื่องนี้ได้ — ถ้าเว็บรันบน Render และ OBS อยู่ที่บ้าน
   ต้องเปิดพอร์ตออกอินเทอร์เน็ต หรือใช้ Tailscale/ngrok เชื่อมสองฝั่งเข้าด้วยกัน)

## 5. ไลฟ์ 5 ชั่วโมง
- เช็คว่าเน็ตอัปโหลดพอสำหรับความละเอียด/บิตเรตที่ตั้งไว้ต่อเนื่อง 5 ชม.
- ปิด sleep/screensaver ของเครื่องที่รันเกม
- แนะนำตั้ง OBS ให้ auto-reconnect เมื่อหลุดสัญญาณ (Settings > Advanced > Network > "Automatically reconnect")
