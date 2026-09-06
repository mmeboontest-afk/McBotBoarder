require('dotenv').config()
const readline = require('readline')
const { google } = require('googleapis')

const { YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REDIRECT_URI } = process.env

if (!YOUTUBE_CLIENT_ID || !YOUTUBE_CLIENT_SECRET) {
  console.error('ใส่ YOUTUBE_CLIENT_ID และ YOUTUBE_CLIENT_SECRET ใน .env ก่อนรันสคริปต์นี้')
  process.exit(1)
}

const oauth2Client = new google.auth.OAuth2(
  YOUTUBE_CLIENT_ID,
  YOUTUBE_CLIENT_SECRET,
  YOUTUBE_REDIRECT_URI || 'http://localhost:3000/oauth2callback'
)

const url = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: ['https://www.googleapis.com/auth/youtube']
})

console.log('\n1) เปิดลิงก์นี้ในเบราว์เซอร์ แล้วล็อกอินด้วยบัญชี YouTube ของคุณ:\n')
console.log(url)
console.log('\n2) หลัง allow แล้วเบราว์เซอร์จะพาไปหน้า redirect ที่มี ?code=XXXX ต่อท้าย URL')
console.log('   ก็อปค่า XXXX (เฉพาะโค้ด ไม่เอาส่วนอื่น) มาวางที่นี่แล้วกด Enter:\n')

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
rl.question('วางโค้ดตรงนี้: ', async (code) => {
  rl.close()
  try {
    const { tokens } = await oauth2Client.getToken(code.trim())
    console.log('\n✅ สำเร็จ! เอาค่านี้ไปใส่ใน .env ที่ YOUTUBE_REFRESH_TOKEN=\n')
    console.log(tokens.refresh_token)
    console.log('\n(ถ้าไม่มี refresh_token ปรากฏ ให้ลองไปเพิกถอนสิทธิ์แอปนี้ที่ https://myaccount.google.com/permissions แล้วรันสคริปต์นี้ใหม่อีกครั้ง)')
  } catch (err) {
    console.error('แลกโค้ดเป็น token ไม่สำเร็จ:', err.message)
  }
})
