import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

function validatePassword(password) {
  const errors = []
  if (password.length < 10) errors.push('At least 10 characters')
  if (!/[A-Z]/.test(password)) errors.push('At least one uppercase letter')
  if (!/[a-z]/.test(password)) errors.push('At least one lowercase letter')
  if (!/[0-9]/.test(password)) errors.push('At least one number')
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) errors.push('At least one special character')
  return errors
}

function generateTempPassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$'
  let pwd = ''
  for (let i = 0; i < 12; i++) pwd += chars[Math.floor(Math.random() * chars.length)]
  return pwd
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { action } = req.body

  // ── SIGN UP ──────────────────────────────────────────────────
  if (action === 'signup') {
    const { phone, password, confirmPassword, firstName, lastName, smsPromos } = req.body

    if (password !== confirmPassword) return res.status(400).json({ error: 'Passwords do not match' })

    const pwErrors = validatePassword(password)
    if (pwErrors.length > 0) return res.status(400).json({ error: pwErrors.join('. ') })

    const cleanPhone = phone.replace(/\D/g, '')
    if (cleanPhone.length !== 10) return res.status(400).json({ error: 'Enter a valid 10-digit phone number' })

    const { data: existing } = await supabase
      .from('customers')
      .select('id')
      .eq('phone', cleanPhone)
      .single()

    if (existing) return res.status(400).json({ error: 'An account with this phone number already exists' })

    const hashed = await bcrypt.hash(password, 12)

    const { data: customer, error } = await supabase
      .from('customers')
      .insert({
        phone: cleanPhone,
        first_name: firstName,
        last_name: lastName,
        email: '',
        password_hash: hashed,
        points: 0,
        sms_announcements: true,
        sms_closing_reminders: true,
        sms_pickup_reminders: true,
        sms_order_ready: true,
        sms_promos: smsPromos !== false,
        requires_password_change: false
      })
      .select()
      .single()

    if (error) return res.status(500).json({ error: 'Failed to create account' })

    return res.status(200).json({ success: true, customer: { id: customer.id, firstName: customer.first_name, lastName: customer.last_name, phone: customer.phone, points: 0 } })
  }

  // ── LOGIN ─────────────────────────────────────────────────────
  if (action === 'login') {
    const { phone, password } = req.body

    const cleanPhone = phone.replace(/\D/g, '')

    const { data: customer } = await supabase
      .from('customers')
      .select('*')
      .eq('phone', cleanPhone)
      .single()

    if (!customer) return res.status(401).json({ error: 'No account found with this phone number' })

    const valid = await bcrypt.compare(password, customer.password_hash)
    if (!valid) return res.status(401).json({ error: 'Incorrect password' })

    return res.status(200).json({
      success: true,
      customer: {
        id: customer.id,
        firstName: customer.first_name,
        lastName: customer.last_name,
        phone: customer.phone,
        email: customer.email,
        points: customer.points,
        savedStreet: customer.saved_street,
        savedCity: customer.saved_city,
        savedZip: customer.saved_zip,
        requiresPasswordChange: customer.requires_password_change
      }
    })
  }

  // ── FORGOT PASSWORD ───────────────────────────────────────────
  if (action === 'forgot_password') {
    const { phone } = req.body
    const cleanPhone = phone.replace(/\D/g, '')

    const { data: customer } = await supabase
      .from('customers')
      .select('id, first_name')
      .eq('phone', cleanPhone)
      .single()

    if (!customer) return res.status(404).json({ error: 'No account found with this phone number' })

    const tempPwd = generateTempPassword()
    const hashed = await bcrypt.hash(tempPwd, 12)

    await supabase
      .from('customers')
      .update({ password_hash: hashed, requires_password_change: true })
      .eq('id', customer.id)

    // Send via Twilio
    try {
      const twilio = require('twilio')
      const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
      await client.messages.create({
        body: `Hi ${customer.first_name}! Your temporary Elizabeth & Co. password is: ${tempPwd}\n\nYou'll be asked to set a new password when you log in. Reply STOP to unsubscribe.`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: '+1' + cleanPhone
      })
    } catch (e) {
      console.error('SMS error:', e)
    }

    return res.status(200).json({ success: true })
  }

  // ── CHANGE PASSWORD ───────────────────────────────────────────
  if (action === 'change_password') {
    const { customerId, currentPassword, newPassword, confirmNewPassword } = req.body

    if (newPassword !== confirmNewPassword) return res.status(400).json({ error: 'New passwords do not match' })

    const pwErrors = validatePassword(newPassword)
    if (pwErrors.length > 0) return res.status(400).json({ error: pwErrors.join('. ') })

    const { data: customer } = await supabase
      .from('customers')
      .select('password_hash')
      .eq('id', customerId)
      .single()

    if (!customer) return res.status(404).json({ error: 'Account not found' })

    const valid = await bcrypt.compare(currentPassword, customer.password_hash)
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' })

    const hashed = await bcrypt.hash(newPassword, 12)
    await supabase
      .from('customers')
      .update({ password_hash: hashed, requires_password_change: false })
      .eq('id', customerId)

    return res.status(200).json({ success: true })
  }

  // ── ADMIN SEND TEMP PASSWORD ──────────────────────────────────
  if (action === 'admin_reset_password') {
    const { customerId } = req.body

    const { data: customer } = await supabase
      .from('customers')
      .select('id, first_name, phone')
      .eq('id', customerId)
      .single()

    if (!customer) return res.status(404).json({ error: 'Customer not found' })

    const tempPwd = generateTempPassword()
    const hashed = await bcrypt.hash(tempPwd, 12)

    await supabase
      .from('customers')
      .update({ password_hash: hashed, requires_password_change: true })
      .eq('id', customer.id)

    try {
      const twilio = require('twilio')
      const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
      await client.messages.create({
        body: `Hi ${customer.first_name}! Your temporary Elizabeth & Co. password is: ${tempPwd}\n\nYou'll be asked to set a new password when you log in.`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: '+1' + customer.phone
      })
    } catch (e) {
      console.error('SMS error:', e)
    }

    return res.status(200).json({ success: true })
  }

  return res.status(400).json({ error: 'Invalid action' })
}
