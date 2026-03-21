if (action === 'admin_login') {
    const { phone, password, code } = req.body
    const cleanPhone = phone.replace(/\D/g, '')
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Ry101606'

    if (cleanPhone !== ADMIN_PHONE) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }
    if (password !== ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }
    if (code !== ADMIN_CODE) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    return res.status(200).json({ success: true, token: 'admin-authenticated' })
  }
