const twilio = require('twilio')

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { to, message } = req.body

  if (!to || !message) {
    return res.status(400).json({ error: 'Missing phone number or message' })
  }

  try {
    const client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    )

    await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: to
    })

    res.status(200).json({ success: true })
  } catch (error) {
    console.error('Twilio error:', error)
    res.status(500).json({ error: error.message })
  }
}
