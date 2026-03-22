import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const ADMIN_PHONE = process.env.ADMIN_PHONE || '9093280992'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Ry101606'
const ADMIN_CODE = process.env.ADMIN_CODE || '060716'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { action } = req.body

  // ── ADMIN LOGIN ───────────────────────────────────────────────
  if (action === 'admin_login') {
    const { phone, password, code } = req.body
    const cleanPhone = (phone || '').replace(/\D/g, '')
    if (cleanPhone !== ADMIN_PHONE || password !== ADMIN_PASSWORD || code !== ADMIN_CODE) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }
    return res.status(200).json({ success: true })
  }

  // ── UPDATE PRODUCT ────────────────────────────────────────────
  if (action === 'update_product') {
    const { id, name, description, price, category, variants, variant_prices, emoji, is_active, image_url } = req.body
    const { error } = await supabase.from('products').update({
      name, description, price: parseFloat(price), category, variants,
      variant_prices: variant_prices || null, emoji, is_active, image_url: image_url || null
    }).eq('id', id)
    if (error) return res.status(500).json({ error: 'Failed to update product' })
    return res.status(200).json({ success: true })
  }

  // ── CREATE PRODUCT ────────────────────────────────────────────
  if (action === 'create_product') {
    const { name, description, price, category, variants, variant_prices, emoji, image_url } = req.body
    const { data, error } = await supabase.from('products').insert({
      name, description, price: parseFloat(price), category, variants,
      variant_prices: variant_prices || null, emoji, is_active: true, image_url: image_url || null
    }).select().single()
    if (error) return res.status(500).json({ error: 'Failed to create product' })
    return res.status(200).json({ success: true, product: data })
  }

  // ── UPDATE CUSTOMER ───────────────────────────────────────────
  if (action === 'update_customer') {
    const { id, first_name, last_name, email, phone, zip_code, saved_street, saved_city, saved_zip } = req.body
    const cleanPhone = (phone || '').replace(/\D/g, '')
    const { error } = await supabase.from('customers').update({
      first_name, last_name, email, phone: cleanPhone, zip_code, saved_street, saved_city, saved_zip
    }).eq('id', id)
    if (error) return res.status(500).json({ error: 'Failed to update customer' })
    return res.status(200).json({ success: true })
  }

  // ── UPDATE BAKE DAY ───────────────────────────────────────────
  if (action === 'update_bake_day') {
    const { id, is_open, label, bake_date, pickup_start, pickup_end, pickup_instructions, delivery_enabled, delivery_fee } = req.body
    const { error } = await supabase.from('bake_days').update({
      is_open, label, bake_date, pickup_start, pickup_end, pickup_instructions,
      delivery_enabled: delivery_enabled || false, delivery_fee: delivery_fee || 5
    }).eq('id', id)
    if (error) return res.status(500).json({ error: 'Failed to update bake day' })
    return res.status(200).json({ success: true })
  }

  // ── CREATE BAKE DAY ───────────────────────────────────────────
  if (action === 'create_bake_day') {
    const { bake_date, label, cutoff_datetime, pickup_start, pickup_end, pickup_instructions } = req.body
    const { data, error } = await supabase.from('bake_days').insert({
      bake_date, label, cutoff_datetime, pickup_start, pickup_end,
      pickup_instructions, is_open: false
    }).select().single()
    if (error) return res.status(500).json({ error: 'Failed to create bake day' })
    return res.status(200).json({ success: true, bakeDay: data })
  }

  // ── SAVE SETTINGS ─────────────────────────────────────────────
  if (action === 'save_settings') {
    const { bakery_name, pickup_city, pickup_address, zelle_recipient, venmo_handle, tax_rate, contact_phone } = req.body
    const settings = { bakery_name, pickup_city, pickup_address, zelle_recipient, venmo_handle, tax_rate, contact_phone }
    for (const [key, value] of Object.entries(settings)) {
      if (value !== undefined) {
        await supabase.from('admin_settings').upsert({ key, value: String(value) })
      }
    }
    return res.status(200).json({ success: true })
  }

  // ── GET SETTINGS ──────────────────────────────────────────────
  if (action === 'get_settings') {
    const { data } = await supabase.from('admin_settings').select('*')
    const settings = {}
    if (data) data.forEach(row => { settings[row.key] = row.value })
    return res.status(200).json({ success: true, settings })
  }

  // ── UPDATE ADMIN CREDENTIALS ──────────────────────────────────
  if (action === 'update_admin_password') {
    const { currentCode, newPhone, newCode, newPassword } = req.body
    if (currentCode !== ADMIN_CODE) {
      return res.status(401).json({ error: 'Current access code is incorrect' })
    }
    if (newPhone) await supabase.from('admin_settings').upsert({ key: 'admin_phone', value: newPhone.replace(/\D/g, '') })
    if (newCode) await supabase.from('admin_settings').upsert({ key: 'admin_code', value: newCode })
    if (newPassword) await supabase.from('admin_settings').upsert({ key: 'admin_password', value: newPassword })
    return res.status(200).json({ success: true })
  }

  // ── PROMO CODES ───────────────────────────────────────────────
  if (action === 'create_promo') {
    const { code, type, value, start_date, end_date, max_uses } = req.body
    if (!code || !type || !value) return res.status(400).json({ error: 'Code, type and value are required' })
    const { data, error } = await supabase.from('promo_codes').insert({
      code: code.toUpperCase(), type, value: parseFloat(value),
      start_date: start_date || null, end_date: end_date || null,
      max_uses: max_uses ? parseInt(max_uses) : null,
      use_count: 0, is_active: true
    }).select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ success: true, promo: data })
  }

  if (action === 'update_promo') {
    const { id, is_active, end_date, max_uses } = req.body
    const { error } = await supabase.from('promo_codes').update({ is_active, end_date, max_uses }).eq('id', id)
    if (error) return res.status(500).json({ error: 'Failed to update promo' })
    return res.status(200).json({ success: true })
  }

  if (action === 'delete_promo') {
    const { id } = req.body
    await supabase.from('promo_codes').delete().eq('id', id)
    return res.status(200).json({ success: true })
  }

  if (action === 'validate_promo') {
    const { code, subtotal } = req.body
    const { data: promo } = await supabase.from('promo_codes').select('*').eq('code', code.toUpperCase()).single()
    if (!promo) return res.status(404).json({ error: 'Promo code not found' })
    if (!promo.is_active) return res.status(400).json({ error: 'This promo code is no longer active' })
    const today = new Date().toISOString().split('T')[0]
    if (promo.start_date && today < promo.start_date) return res.status(400).json({ error: 'This promo code is not active yet' })
    if (promo.end_date && today > promo.end_date) return res.status(400).json({ error: 'This promo code has expired' })
    if (promo.max_uses && promo.use_count >= promo.max_uses) return res.status(400).json({ error: 'This promo code has reached its maximum uses' })
    const discount = promo.type === 'percent'
      ? Math.round((subtotal * promo.value / 100) * 100) / 100
      : Math.min(promo.value, subtotal)
    return res.status(200).json({ success: true, promo, discount })
  }

  if (action === 'redeem_promo') {
    const { code } = req.body
    const { data: promo } = await supabase.from('promo_codes').select('*').eq('code', code.toUpperCase()).single()
    if (!promo) return res.status(404).json({ error: 'Promo not found' })
    const newCount = promo.use_count + 1
    const shouldDeactivate = promo.max_uses && newCount >= promo.max_uses
    await supabase.from('promo_codes').update({
      use_count: newCount,
      is_active: shouldDeactivate ? false : promo.is_active
    }).eq('id', promo.id)
    return res.status(200).json({ success: true })
  }

  // ── CUSTOM REQUEST RESPOND ────────────────────────────────────
  if (action === 'respond_to_request') {
    const { id, status, message, customerPhone, customerName } = req.body
    await supabase.from('custom_requests').update({ status }).eq('id', id)
    if (customerPhone && message) {
      try {
        const twilio = require('twilio')
        const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
        await client.messages.create({
          body: message,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: '+1' + customerPhone.replace(/\D/g, '')
        })
      } catch (e) { console.error('SMS error:', e) }
    }
    return res.status(200).json({ success: true })
  }

  // ── GET DASHBOARD STATS ───────────────────────────────────────
  if (action === 'get_stats') {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const startOfYear = new Date(now.getFullYear(), 0, 1).toISOString()

    const { data: allOrders } = await supabase.from('orders').select('total, created_at, fulfillment_status')

    const allTime = allOrders || []
    const ytd = allTime.filter(o => o.created_at >= startOfYear)
    const mtd = allTime.filter(o => o.created_at >= startOfMonth)

    const sum = arr => arr.reduce((s, o) => s + (o.total || 0), 0)

    return res.status(200).json({
      success: true,
      stats: {
        allTime: { orders: allTime.length, revenue: sum(allTime) },
        ytd: { orders: ytd.length, revenue: sum(ytd) },
        mtd: { orders: mtd.length, revenue: sum(mtd) }
      }
    })
  }

  // ── UPLOAD PRODUCT IMAGE (get signed URL) ─────────────────────
  if (action === 'get_upload_url') {
    const { filename, contentType } = req.body
    const path = `products/${Date.now()}-${filename}`
    const { data, error } = await supabase.storage.from('product-images').createSignedUploadUrl(path)
    if (error) return res.status(500).json({ error: 'Failed to create upload URL' })
    const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${path}`
    return res.status(200).json({ success: true, uploadUrl: data.signedUrl, publicUrl, token: data.token })
  }

  return res.status(400).json({ error: 'Invalid action' })
}
