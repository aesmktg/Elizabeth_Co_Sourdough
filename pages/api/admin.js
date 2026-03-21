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

    return res.status(200).json({ success: true, token: 'admin-authenticated' })
  }

  // ── UPDATE PRODUCT ────────────────────────────────────────────
  if (action === 'update_product') {
    const { id, name, description, price, category, variants, emoji, is_active } = req.body

    const { error } = await supabase
      .from('products')
      .update({ name, description, price: parseFloat(price), category, variants, emoji, is_active })
      .eq('id', id)

    if (error) return res.status(500).json({ error: 'Failed to update product' })
    return res.status(200).json({ success: true })
  }

  // ── CREATE PRODUCT ────────────────────────────────────────────
  if (action === 'create_product') {
    const { name, description, price, category, variants, emoji } = req.body

    const { data, error } = await supabase
      .from('products')
      .insert({ name, description, price: parseFloat(price), category, variants, emoji, is_active: true })
      .select()
      .single()

    if (error) return res.status(500).json({ error: 'Failed to create product' })
    return res.status(200).json({ success: true, product: data })
  }

  // ── UPDATE CUSTOMER ───────────────────────────────────────────
  if (action === 'update_customer') {
    const { id, first_name, last_name, email, phone, zip_code, saved_street, saved_city, saved_zip } = req.body

    const cleanPhone = (phone || '').replace(/\D/g, '')

    const { error } = await supabase
      .from('customers')
      .update({ first_name, last_name, email, phone: cleanPhone, zip_code, saved_street, saved_city, saved_zip })
      .eq('id', id)

    if (error) return res.status(500).json({ error: 'Failed to update customer' })
    return res.status(200).json({ success: true })
  }

  // ── UPDATE ADMIN CREDENTIALS ──────────────────────────────────
  if (action === 'update_admin_password') {
    const { currentCode, newPhone, newCode } = req.body

    if (currentCode !== ADMIN_CODE) {
      return res.status(401).json({ error: 'Current access code is incorrect' })
    }

    const { error } = await supabase
      .from('admin_settings')
      .upsert({ key: 'admin_phone', value: (newPhone || '').replace(/\D/g, '') })

    await supabase
      .from('admin_settings')
      .upsert({ key: 'admin_code', value: newCode })

    if (error) return res.status(500).json({ error: 'Failed to update credentials' })
    return res.status(200).json({ success: true })
  }

  // ── UPDATE BAKE DAY ───────────────────────────────────────────
  if (action === 'update_bake_day') {
    const { id, is_open, pickup_instructions, pickup_start, pickup_end } = req.body

    const { error } = await supabase
      .from('bake_days')
      .update({ is_open, pickup_instructions, pickup_start, pickup_end })
      .eq('id', id)

    if (error) return res.status(500).json({ error: 'Failed to update bake day' })
    return res.status(200).json({ success: true })
  }

  // ── CREATE BAKE DAY ───────────────────────────────────────────
  if (action === 'create_bake_day') {
    const { bake_date, label, cutoff_datetime, pickup_start, pickup_end, pickup_instructions } = req.body

    const { data, error } = await supabase
      .from('bake_days')
      .insert({ bake_date, label, cutoff_datetime, pickup_start, pickup_end, pickup_instructions, is_open: false })
      .select()
      .single()

    if (error) return res.status(500).json({ error: 'Failed to create bake day' })
    return res.status(200).json({ success: true, bakeDay: data })
  }

  return res.status(400).json({ error: 'Invalid action' })
}
