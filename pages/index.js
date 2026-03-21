import { useEffect, useState } from 'react'
import supabase from '../api/index'
import Head from 'next/head'

export default function Home() {
  const [view, setView] = useState('home')
  const [products, setProducts] = useState([])
  const [bakeDays, setBakeDays] = useState([])
  const [rewardBlocks, setRewardBlocks] = useState([])
  const [cart, setCart] = useState([])
  const [selectedVariants, setSelectedVariants] = useState({})
  const [currentBakeDay, setCurrentBakeDay] = useState(null)
  const [cartOpen, setCartOpen] = useState(false)
  const [smsModalOpen, setSmsModalOpen] = useState(false)
  const [requestModalOpen, setRequestModalOpen] = useState(false)
  const [productFilter, setProductFilter] = useState('all')
  const [deliverySelected, setDeliverySelected] = useState(false)
  const [selectedPayment, setSelectedPayment] = useState('card')
  const [redeemedBlock, setRedeemedBlock] = useState(null)
  const [ptsPanelOpen, setPtsPanelOpen] = useState(false)
  const [userPoints, setUserPoints] = useState(0)
  const [customer, setCustomer] = useState(null)
  const [orders, setOrders] = useState([])
  const [confirmation, setConfirmation] = useState(null)
  const [adminTab, setAdminTab] = useState('dashboard')
  const [adminBakeDay, setAdminBakeDay] = useState(null)
  const [adminOrdersView, setAdminOrdersView] = useState('list')
  const [adminOrders, setAdminOrders] = useState([])
  const [notifBanner, setNotifBanner] = useState(true)
  const [acctTab, setAcctTab] = useState('orders')
  const [useNewAddress, setUseNewAddress] = useState(false)
  const [reqType, setReqType] = useState('custom_date')

  // Checkout form state
  const [checkoutForm, setCheckoutForm] = useState({
    firstName: '', lastName: '', email: '', phone: '',
    deliveryStreet: '', deliveryCity: '', deliveryZip: '',
    notes: '', saveAddress: false,
    smsConfirmation: true, smsPickup: true, smsReady: true, smsPromos: true
  })

  // Request form state
  const [requestForm, setRequestForm] = useState({
    firstName: '', lastName: '', email: '', phone: '',
    requestedDates: '', itemsRequested: '', notes: ''
  })

  // ── Load data on mount ──────────────────────────────────────
  useEffect(() => {
    loadProducts()
    loadBakeDays()
    loadRewardBlocks()
    loadCustomer()
  }, [])

  async function loadProducts() {
    const { data } = await supabase
      .from('products')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
    if (data) {
      setProducts(data)
      const vars = {}
      data.forEach(p => { vars[p.id] = 0 })
      setSelectedVariants(vars)
    }
  }

  async function loadBakeDays() {
    const { data } = await supabase
      .from('bake_days')
      .select('*')
      .order('bake_date')
    if (data) {
      setBakeDays(data)
      const firstOpen = data.find(d => d.is_open)
      if (firstOpen) setCurrentBakeDay(firstOpen)
      setAdminBakeDay(data.find(d => d.is_open) || data[0])
    }
  }

  async function loadRewardBlocks() {
    const { data } = await supabase
      .from('reward_blocks')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
    if (data) setRewardBlocks(data)
  }

  async function loadCustomer() {
    // In production this would use auth. For now load demo customer.
    const { data } = await supabase
      .from('customers')
      .select('*')
      .eq('email', 'sarah@example.com')
      .single()
    if (data) {
      setCustomer(data)
      setUserPoints(data.points || 0)
      setCheckoutForm(f => ({
        ...f,
        firstName: data.first_name || '',
        lastName: data.last_name || '',
        email: data.email || '',
        phone: data.phone || '',
      }))
      loadOrders(data.id)
    }
  }

  async function loadOrders(customerId) {
    const { data } = await supabase
      .from('orders')
      .select(`*, order_items(*), bake_days(label)`)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
    if (data) setOrders(data)
  }

  async function loadAdminOrders(bakeDayId) {
    const { data } = await supabase
      .from('orders')
      .select(`*, order_items(*), customers(first_name, last_name, phone)`)
      .eq('bake_day_id', bakeDayId)
      .order('created_at', { ascending: false })
    if (data) setAdminOrders(data)
  }

  // ── Cart helpers ────────────────────────────────────────────
  function cartSubtotal() {
    return cart.reduce((s, i) => s + i.unit_price * i.quantity, 0)
  }

  function addToCart(product) {
    const variantIdx = selectedVariants[product.id] || 0
    const variant = product.variants?.[variantIdx] || ''
    setCart(prev => {
      const existing = prev.find(i => i.product_id === product.id && i.variant === variant)
      if (existing) return prev.map(i => i.product_id === product.id && i.variant === variant ? { ...i, quantity: i.quantity + 1 } : i)
      return [...prev, { product_id: product.id, product_name: product.name, emoji: product.emoji, variant, quantity: 1, unit_price: product.price }]
    })
    setCartOpen(true)
  }

  function changeQty(productId, variant, delta) {
    setCart(prev => {
      const updated = prev.map(i => i.product_id === productId && i.variant === variant ? { ...i, quantity: i.quantity + delta } : i)
      return updated.filter(i => i.quantity > 0)
    })
  }

  // ── Bake day sync ───────────────────────────────────────────
  function syncBakeDay(bakeDay) {
    if (bakeDay.id === currentBakeDay?.id) return
    if (cart.length > 0) {
      if (!confirm(`Switching to ${bakeDay.label} will clear your current cart. Continue?`)) return
      setCart([])
    }
    setCurrentBakeDay(bakeDay)
  }

  // ── Place order ─────────────────────────────────────────────
  async function placeOrder() {
    if (!customer || !currentBakeDay || cart.length === 0) return

    const sub = cartSubtotal()
    const dFee = deliverySelected ? (currentBakeDay.delivery_fee || 5) : 0
    const discount = redeemedBlock ? redeemedBlock.discount_value : 0
    const taxable = Math.max(0, sub + dFee - discount)
    const tax = taxable * 0.085
    const total = taxable + tax
    const ptsEarned = Math.floor(sub)
    const orderNumber = 'ECO-' + Date.now()

    const { data: order, error } = await supabase
      .from('orders')
      .insert({
        order_number: orderNumber,
        customer_id: customer.id,
        bake_day_id: currentBakeDay.id,
        fulfillment_type: deliverySelected ? 'delivery' : 'pickup',
        delivery_street: deliverySelected ? checkoutForm.deliveryStreet : null,
        delivery_city: deliverySelected ? checkoutForm.deliveryCity : null,
        delivery_zip: deliverySelected ? checkoutForm.deliveryZip : null,
        payment_method: selectedPayment,
        payment_status: selectedPayment === 'card' ? 'paid' : 'pending',
        fulfillment_status: 'unfulfilled',
        subtotal: sub,
        delivery_fee: dFee,
        points_redeemed: redeemedBlock ? redeemedBlock.points_required : 0,
        discount_amount: discount,
        tax: parseFloat(tax.toFixed(2)),
        total: parseFloat(total.toFixed(2)),
        points_earned: ptsEarned,
        notes: checkoutForm.notes
      })
      .select()
      .single()

    if (error) { alert('Something went wrong. Please try again.'); return }

    // Insert order items
    await supabase.from('order_items').insert(
      cart.map(i => ({
        order_id: order.id,
        product_id: i.product_id,
        product_name: i.product_name,
        variant: i.variant || null,
        quantity: i.quantity,
        unit_price: i.unit_price,
        line_total: i.unit_price * i.quantity
      }))
    )

    // Update customer points
    const newPoints = userPoints - (redeemedBlock?.points_required || 0) + ptsEarned
    await supabase.from('customers').update({ points: newPoints }).eq('id', customer.id)

    // Log points
    if (ptsEarned > 0) {
      await supabase.from('points_ledger').insert({ customer_id: customer.id, order_id: order.id, type: 'earned', points: ptsEarned, note: `Order ${orderNumber}` })
    }
    if (redeemedBlock) {
      await supabase.from('points_ledger').insert({ customer_id: customer.id, order_id: order.id, type: 'redeemed', points: -redeemedBlock.points_required, note: `${redeemedBlock.label} redeemed` })
    }

    // Save address if requested
    if (deliverySelected && checkoutForm.saveAddress) {
      await supabase.from('customers').update({
        saved_street: checkoutForm.deliveryStreet,
        saved_city: checkoutForm.deliveryCity,
        saved_zip: checkoutForm.deliveryZip
      }).eq('id', customer.id)
    }

    setUserPoints(newPoints)
    setConfirmation({ order, sub, tax: tax.toFixed(2), total: total.toFixed(2), discount, orderNumber })
    setCart([])
    setRedeemedBlock(null)
    setPtsPanelOpen(false)
    setView('confirmation')
  }

  // ── Admin: mark order ready ─────────────────────────────────
  async function markOrderReady(orderId, customerName, phone) {
    await supabase.from('orders').update({ fulfillment_status: 'ready' }).eq('id', orderId)
    setAdminOrders(prev => prev.map(o => o.id === orderId ? { ...o, fulfillment_status: 'ready' } : o))
    // In production: Twilio fires here via API route
    alert(`📱 Text sent to ${customerName} (${phone}):\n\n"Hi ${customerName.split(' ')[0]}! Your Elizabeth & Co. order is packed and ready for pickup. See you soon! 🍞"`)
  }

  // ── Filtered products ───────────────────────────────────────
  const filteredProducts = productFilter === 'all' ? products : products.filter(p => p.category === productFilter)
  const openBakeDays = bakeDays.filter(d => d.is_open)

  // ── Totals ──────────────────────────────────────────────────
  const sub = cartSubtotal()
  const dFee = deliverySelected ? 5 : 0
  const discount = redeemedBlock ? redeemedBlock.discount_value : 0
  const taxable = Math.max(0, sub + dFee - discount)
  const tax = taxable * 0.085
  const total = taxable + tax

  return (
    <>
      <Head>
        <title>Elizabeth & Co. — Artisan Sourdough</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
      </Head>

      <style>{`
        :root {
          --cream: #F8F5EE; --warm-white: #FDFAF4;
          --sage: #6B7C5C; --sage-light: #EEF2E9; --sage-dark: #4A5840;
          --earth: #8B6F4E; --charcoal: #2C2C2A; --mid: #6B6B68;
          --border: rgba(44,44,42,0.1); --border-strong: rgba(44,44,42,0.2);
          --gold: #C4973A; --gold-light: #FBF4E6; --radius: 14px;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'DM Sans', sans-serif; background: var(--warm-white); color: var(--charcoal); }
        input, select, textarea, button { font-family: 'DM Sans', sans-serif; }

        .nav { background: var(--warm-white); border-bottom: 1px solid var(--border); padding: 0 2rem; display: flex; align-items: center; justify-content: space-between; height: 64px; position: sticky; top: 0; z-index: 100; }
        .nav-logo { font-family: 'Cormorant Garamond', serif; font-size: 22px; font-weight: 400; color: var(--charcoal); display: flex; align-items: center; gap: 10px; cursor: pointer; }
        .logo-mark { width: 34px; height: 34px; background: var(--sage); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 16px; font-family: 'Cormorant Garamond', serif; }
        .nav-links { display: flex; gap: 2rem; }
        .nav-link { font-size: 14px; color: var(--mid); cursor: pointer; padding: 4px 0; border-bottom: 2px solid transparent; transition: all 0.2s; background: none; border-top: none; border-left: none; border-right: none; }
        .nav-link:hover, .nav-link.active { color: var(--charcoal); border-bottom-color: var(--sage); }
        .nav-right { display: flex; gap: 12px; align-items: center; }
        .points-pill { background: var(--gold-light); border: 1px solid rgba(196,151,58,0.25); border-radius: 20px; padding: 6px 12px; font-size: 12px; font-weight: 500; color: #8A5E10; display: flex; align-items: center; gap: 5px; cursor: pointer; }
        .btn-ghost { font-size: 13px; font-weight: 500; color: var(--mid); background: none; border: 1px solid var(--border-strong); border-radius: 8px; padding: 8px 16px; cursor: pointer; }
        .btn-primary { font-size: 13px; font-weight: 500; color: white; background: var(--sage); border: none; border-radius: 8px; padding: 8px 18px; cursor: pointer; }
        .btn-primary:hover { background: var(--sage-dark); }
        .cart-btn { position: relative; background: var(--cream); border: 1px solid var(--border); border-radius: 8px; width: 38px; height: 38px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 16px; }
        .cart-badge { position: absolute; top: -4px; right: -4px; background: var(--sage); color: white; width: 18px; height: 18px; border-radius: 50%; font-size: 10px; display: flex; align-items: center; justify-content: center; font-weight: 500; }

        .notif-banner { background: var(--sage); color: white; padding: 12px 2rem; display: flex; align-items: center; gap: 12px; font-size: 13px; }
        .notif-btn { background: white; color: var(--sage-dark); border: none; border-radius: 6px; padding: 6px 14px; font-size: 12px; font-weight: 500; cursor: pointer; }
        .notif-dismiss { background: none; border: none; color: rgba(255,255,255,0.7); cursor: pointer; font-size: 18px; line-height: 1; }

        .hero { background: var(--cream); padding: 5rem 2rem 4rem; text-align: center; border-bottom: 1px solid var(--border); }
        .hero-eyebrow { font-size: 12px; font-weight: 500; letter-spacing: 0.12em; text-transform: uppercase; color: var(--sage); margin-bottom: 1rem; }
        .hero-title { font-family: 'Cormorant Garamond', serif; font-size: clamp(40px,6vw,64px); font-weight: 300; line-height: 1.15; margin-bottom: 1.25rem; }
        .hero-title em { font-style: italic; color: var(--sage-dark); }
        .hero-sub { font-size: 15px; color: var(--mid); max-width: 480px; margin: 0 auto 2rem; line-height: 1.7; font-weight: 300; }
        .hero-ctas { display: flex; justify-content: center; gap: 12px; flex-wrap: wrap; }
        .btn-large { font-size: 14px; font-weight: 500; padding: 13px 28px; border-radius: 10px; cursor: pointer; border: none; }
        .btn-large-primary { background: var(--sage); color: white; }
        .btn-large-primary:hover { background: var(--sage-dark); }
        .btn-large-outline { background: white; color: var(--charcoal); border: 1px solid var(--border-strong) !important; }
        .next-bake { margin-top: 2.5rem; display: inline-flex; align-items: center; gap: 12px; background: white; border: 1px solid var(--border); border-radius: 50px; padding: 10px 20px; font-size: 13px; }
        .bake-dot { width: 8px; height: 8px; border-radius: 50%; background: #5C8A4A; }

        .section { padding: 3rem 2rem; max-width: 1100px; margin: 0 auto; }
        .section-title { font-family: 'Cormorant Garamond', serif; font-size: 30px; font-weight: 400; margin-bottom: 2rem; }

        .bake-days { display: flex; gap: 14px; overflow-x: auto; padding-bottom: 8px; }
        .bake-day-card { flex: 0 0 180px; background: white; border: 1.5px solid var(--border); border-radius: var(--radius); padding: 1.25rem; cursor: pointer; transition: all 0.2s; }
        .bake-day-card.selected { border-color: var(--sage); background: var(--sage-light); }
        .bake-day-card.locked { opacity: 0.55; cursor: default; }
        .bake-month { font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.08em; color: var(--mid); margin-bottom: 4px; }
        .bake-day-num { font-family: 'Cormorant Garamond', serif; font-size: 38px; font-weight: 300; line-height: 1; }
        .bake-day-name { font-size: 13px; color: var(--mid); margin-top: 4px; }
        .bake-status { margin-top: 12px; font-size: 11px; font-weight: 500; padding: 4px 10px; border-radius: 20px; display: inline-block; }
        .bake-status.open { background: var(--sage-light); color: var(--sage-dark); }
        .bake-status.soon { background: #F0F0EE; color: var(--mid); }
        .bake-closing { font-size: 11px; color: var(--mid); margin-top: 6px; }

        .bake-selector { background: white; border: 1.5px solid var(--sage); border-radius: 12px; padding: 1rem 1.25rem; margin-bottom: 1.5rem; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .bake-sel-btn { font-size: 13px; padding: 7px 14px; border-radius: 8px; border: 1.5px solid var(--border); background: white; color: var(--mid); cursor: pointer; transition: all 0.2s; }
        .bake-sel-btn.active { border-color: var(--sage); background: var(--sage-light); color: var(--sage-dark); font-weight: 500; }

        .tabs { display: flex; gap: 4px; background: var(--cream); border-radius: 10px; padding: 4px; margin-bottom: 1.5rem; }
        .tab { flex: 1; padding: 8px 12px; border-radius: 8px; border: none; background: none; cursor: pointer; font-size: 13px; color: var(--mid); transition: all 0.2s; }
        .tab.active { background: white; color: var(--charcoal); font-weight: 500; }

        .products-grid { display: grid; grid-template-columns: repeat(auto-fill,minmax(260px,1fr)); gap: 20px; }
        .product-card { background: white; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; transition: all 0.2s; }
        .product-card:hover { border-color: var(--border-strong); transform: translateY(-2px); }
        .product-img { width: 100%; height: 170px; background: var(--cream); display: flex; align-items: center; justify-content: center; font-size: 52px; }
        .product-body { padding: 1rem; }
        .product-category { font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.08em; color: var(--sage); margin-bottom: 4px; }
        .product-name { font-family: 'Cormorant Garamond', serif; font-size: 20px; font-weight: 400; margin-bottom: 4px; }
        .product-desc { font-size: 12px; color: var(--mid); line-height: 1.5; margin-bottom: 10px; font-weight: 300; }
        .variants-label { font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.06em; color: var(--mid); margin-bottom: 6px; }
        .variants { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
        .variant-btn { font-size: 12px; padding: 5px 10px; border-radius: 6px; border: 1px solid var(--border-strong); background: white; cursor: pointer; transition: all 0.15s; }
        .variant-btn.selected { background: var(--sage-light); border-color: var(--sage); color: var(--sage-dark); font-weight: 500; }
        .product-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 10px; }
        .product-price { font-size: 16px; font-weight: 500; }
        .add-btn { background: var(--sage); color: white; border: none; border-radius: 8px; padding: 8px 14px; font-size: 13px; font-weight: 500; cursor: pointer; }
        .add-btn:hover { background: var(--sage-dark); }

        .pickup-hint { background: var(--sage-light); border: 1px solid rgba(107,124,92,0.2); border-radius: 10px; padding: 14px 16px; font-size: 13px; color: var(--sage-dark); margin-top: 1.5rem; display: flex; gap: 10px; }
        .custom-request-banner { background: #F7F1E9; border: 1px solid rgba(139,111,78,0.2); border-radius: 12px; padding: 1.25rem 1.5rem; display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-top: 1.5rem; }
        .crb-btn { background: var(--earth); color: white; border: none; border-radius: 8px; padding: 10px 20px; font-size: 13px; font-weight: 500; cursor: pointer; white-space: nowrap; }

        .cart-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.3); z-index: 200; }
        .cart-drawer { position: fixed; right: 0; top: 0; bottom: 0; width: min(420px,100vw); background: white; border-left: 1px solid var(--border); z-index: 201; display: flex; flex-direction: column; }
        .cart-head { padding: 1.5rem; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
        .cart-head-title { font-family: 'Cormorant Garamond', serif; font-size: 22px; font-weight: 400; }
        .close-btn { width: 32px; height: 32px; background: var(--cream); border: 1px solid var(--border); border-radius: 8px; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center; }
        .cart-bake-info { padding: 10px 1.5rem; border-bottom: 1px solid var(--border); background: var(--sage-light); font-size: 13px; color: var(--sage-dark); }
        .cart-items { flex: 1; overflow-y: auto; padding: 1rem 1.5rem; }
        .cart-item { display: flex; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--border); align-items: flex-start; }
        .cart-item-img { width: 48px; height: 48px; border-radius: 8px; background: var(--cream); font-size: 26px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .cart-item-name { font-size: 14px; font-weight: 500; }
        .cart-item-sub { font-size: 12px; color: var(--mid); margin-top: 2px; }
        .cart-item-price { font-size: 14px; font-weight: 500; margin-left: auto; }
        .qty-ctrl { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
        .qty-btn { width: 24px; height: 24px; border-radius: 6px; border: 1px solid var(--border-strong); background: none; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; }
        .qty-num { font-size: 13px; font-weight: 500; min-width: 20px; text-align: center; }
        .cart-footer { padding: 1.25rem 1.5rem; border-top: 1px solid var(--border); }
        .cart-line { display: flex; justify-content: space-between; font-size: 13px; color: var(--mid); margin-bottom: 6px; }
        .cart-total-line { display: flex; justify-content: space-between; font-size: 16px; font-weight: 500; padding-top: 10px; border-top: 1px solid var(--border); margin-top: 6px; }
        .checkout-btn { width: 100%; margin-top: 14px; background: var(--charcoal); color: white; border: none; border-radius: 10px; padding: 14px; font-size: 15px; font-weight: 500; cursor: pointer; }
        .checkout-btn:hover { background: var(--sage-dark); }

        .checkout-layout { display: grid; grid-template-columns: 1fr 380px; gap: 2rem; max-width: 1000px; margin: 0 auto; padding: 2rem; }
        .checkout-section { background: white; border: 1px solid var(--border); border-radius: var(--radius); padding: 1.5rem; margin-bottom: 1.5rem; }
        .checkout-section-title { font-size: 13px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.08em; color: var(--mid); margin-bottom: 1.25rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border); }
        .fulfillment-opts { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .fulfill-opt { border: 1.5px solid var(--border); border-radius: 10px; padding: 14px 16px; cursor: pointer; transition: all 0.2s; }
        .fulfill-opt.active { border-color: var(--sage); background: var(--sage-light); }
        .fulfill-opt-title { font-size: 14px; font-weight: 500; display: flex; align-items: center; gap: 6px; }
        .fulfill-opt-sub { font-size: 12px; color: var(--mid); margin-top: 3px; }
        .fulfill-badge { font-size: 11px; font-weight: 500; background: rgba(107,124,92,0.12); color: var(--sage-dark); padding: 2px 8px; border-radius: 10px; }
        .payment-opts { display: flex; gap: 8px; flex-wrap: wrap; }
        .pay-opt { flex: 1; min-width: 80px; border: 1.5px solid var(--border); border-radius: 10px; padding: 10px 12px; cursor: pointer; transition: all 0.2s; display: flex; flex-direction: column; align-items: center; gap: 3px; font-size: 12px; font-weight: 500; color: var(--mid); text-align: center; }
        .pay-opt.active { border-color: var(--sage); background: var(--sage-light); color: var(--sage-dark); }
        .pay-opt-icon { font-size: 18px; }
        .pay-instructions { margin-top: 1rem; background: var(--gold-light); border: 1px solid rgba(196,151,58,0.2); border-radius: 10px; padding: 14px 16px; font-size: 13px; line-height: 1.6; }
        .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .form-group { margin-bottom: 12px; }
        .form-label { font-size: 12px; font-weight: 500; color: var(--mid); display: block; margin-bottom: 5px; }
        .form-input { width: 100%; font-size: 14px; padding: 10px 14px; border: 1px solid var(--border-strong); border-radius: 8px; background: white; color: var(--charcoal); outline: none; transition: border-color 0.2s; }
        .form-input:focus { border-color: var(--sage); }

        .order-summary-sticky { position: sticky; top: 80px; }
        .order-summary-card { background: white; border: 1px solid var(--border); border-radius: var(--radius); padding: 1.5rem; }
        .summary-title { font-family: 'Cormorant Garamond', serif; font-size: 20px; font-weight: 400; margin-bottom: 1.25rem; }
        .summary-item { display: flex; gap: 10px; align-items: flex-start; padding: 8px 0; border-bottom: 1px solid var(--border); }
        .summary-item-img { width: 40px; height: 40px; border-radius: 8px; background: var(--cream); font-size: 20px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
        .summary-item-name { font-size: 13px; font-weight: 500; }
        .summary-item-sub { font-size: 11px; color: var(--mid); }
        .summary-item-price { margin-left: auto; font-size: 13px; font-weight: 500; flex-shrink: 0; }
        .summary-lines { padding-top: 12px; }
        .summary-line { display: flex; justify-content: space-between; font-size: 13px; color: var(--mid); margin-bottom: 6px; }
        .summary-total { display: flex; justify-content: space-between; font-size: 16px; font-weight: 500; padding-top: 12px; border-top: 1px solid var(--border); margin-top: 6px; }

        .pts-box { margin: 14px 0; border: 1.5px solid rgba(196,151,58,0.35); border-radius: 12px; overflow: hidden; }
        .pts-header { background: var(--gold-light); padding: 12px 14px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; }
        .pts-toggle { width: 40px; height: 22px; border-radius: 11px; border: none; cursor: pointer; position: relative; transition: background 0.25s; flex-shrink: 0; }
        .pts-toggle.off { background: #D0CBBC; }
        .pts-toggle.on { background: var(--gold); }
        .pts-toggle::after { content: ''; position: absolute; top: 3px; width: 16px; height: 16px; border-radius: 50%; background: white; transition: left 0.25s; }
        .pts-toggle.off::after { left: 3px; }
        .pts-toggle.on::after { left: 21px; }
        .pts-detail { background: white; border-top: 1px solid rgba(196,151,58,0.2); padding: 12px 14px; }
        .pts-item-row { display: flex; justify-content: space-between; align-items: center; font-size: 13px; margin-bottom: 8px; }
        .pts-redeem-btn { font-size: 12px; font-weight: 500; border: 1.5px solid var(--gold); border-radius: 6px; background: none; color: #7A5A10; padding: 4px 10px; cursor: pointer; }
        .pts-redeem-btn.applied { background: var(--gold); color: white; border-color: var(--gold); }
        .pts-cannot { font-size: 12px; color: var(--mid); font-style: italic; }
        .pts-after { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border); font-size: 12px; color: var(--mid); }

        .confirmation-wrap { max-width: 600px; margin: 0 auto; padding: 3rem 2rem; text-align: center; }
        .confirmation-icon { width: 72px; height: 72px; border-radius: 50%; background: var(--sage-light); display: flex; align-items: center; justify-content: center; font-size: 32px; margin: 0 auto 1.5rem; }
        .confirmation-title { font-family: 'Cormorant Garamond', serif; font-size: 36px; font-weight: 300; margin-bottom: 8px; }
        .confirmation-sub { font-size: 15px; color: var(--mid); font-weight: 300; line-height: 1.7; margin-bottom: 2rem; }
        .confirmation-card { background: white; border: 1px solid var(--border); border-radius: var(--radius); padding: 1.5rem; text-align: left; margin-bottom: 1.25rem; }
        .conf-label { font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.08em; color: var(--mid); margin-bottom: 10px; }
        .conf-address-box { background: var(--sage-light); border-radius: 10px; padding: 14px 16px; margin-top: 8px; }
        .sms-note { background: var(--gold-light); border: 1px solid rgba(196,151,58,0.2); border-radius: 10px; padding: 14px 16px; font-size: 13px; display: flex; gap: 10px; align-items: center; }

        .account-layout { display: grid; grid-template-columns: 240px 1fr; gap: 2rem; max-width: 980px; margin: 0 auto; padding: 2rem; }
        .account-avatar { width: 72px; height: 72px; border-radius: 50%; background: var(--sage-light); border: 2px solid var(--sage); display: flex; align-items: center; justify-content: center; font-family: 'Cormorant Garamond', serif; font-size: 28px; color: var(--sage-dark); margin-bottom: 12px; }
        .account-points-card { margin-top: 1.5rem; background: var(--gold-light); border: 1px solid rgba(196,151,58,0.2); border-radius: 12px; padding: 1.25rem; }
        .apt-val { font-family: 'Cormorant Garamond', serif; font-size: 36px; font-weight: 300; }
        .account-nav { margin-top: 1.5rem; display: flex; flex-direction: column; gap: 2px; }
        .account-nav-item { padding: 10px 14px; border-radius: 8px; font-size: 14px; color: var(--mid); cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 8px; background: none; border: none; text-align: left; width: 100%; }
        .account-nav-item:hover { background: var(--cream); }
        .account-nav-item.active { background: var(--sage-light); color: var(--sage-dark); font-weight: 500; }
        .order-hist-item { background: white; border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-start; }
        .order-status { font-size: 11px; font-weight: 500; padding: 4px 10px; border-radius: 20px; }
        .order-status.fulfilled { background: var(--sage-light); color: var(--sage-dark); }
        .order-status.pending { background: var(--gold-light); color: #7A5A10; }
        .order-status.ready { background: #E8F5E9; color: #2E7D32; }
        .reorder-btn { font-size: 12px; font-weight: 500; border: 1px solid var(--border-strong); background: none; border-radius: 6px; padding: 5px 12px; cursor: pointer; color: var(--charcoal); margin-top: 8px; display: block; }

        .sms-opt { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 10px; cursor: pointer; margin-bottom: 8px; }
        .sms-opt:hover { border-color: var(--sage); background: var(--sage-light); }
        .sms-check { width: 18px; height: 18px; border-radius: 50%; border: 2px solid var(--sage); display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 10px; color: white; }
        .sms-check.checked { background: var(--sage); }

        .modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 300; display: flex; align-items: center; justify-content: center; }
        .modal { background: white; border-radius: 18px; width: min(520px,94vw); padding: 2rem; position: relative; max-height: 92vh; overflow-y: auto; }
        .modal-title { font-family: 'Cormorant Garamond', serif; font-size: 28px; font-weight: 400; margin-bottom: 8px; }
        .modal-sub { font-size: 14px; color: var(--mid); margin-bottom: 1.5rem; line-height: 1.6; font-weight: 300; }
        .modal-close { position: absolute; top: 1.25rem; right: 1.25rem; background: var(--cream); border: 1px solid var(--border); width: 30px; height: 30px; border-radius: 8px; cursor: pointer; font-size: 14px; }

        .admin-bar { background: var(--charcoal); color: white; padding: 10px 2rem; display: flex; align-items: center; justify-content: space-between; font-size: 13px; }
        .admin-layout { display: grid; grid-template-columns: 230px 1fr; min-height: calc(100vh - 110px); }
        .admin-sidebar { background: #F5F3EE; border-right: 1px solid var(--border); padding: 1.5rem 0; }
        .admin-nav-item { padding: 10px 1.5rem; font-size: 14px; color: var(--mid); cursor: pointer; display: flex; align-items: center; gap: 8px; transition: all 0.2s; background: none; border: none; width: 100%; text-align: left; }
        .admin-nav-item:hover { background: var(--cream); color: var(--charcoal); }
        .admin-nav-item.active { background: var(--sage-light); color: var(--sage-dark); font-weight: 500; }
        .badge-red { background: #E74C3C; color: white; border-radius: 10px; font-size: 10px; padding: 2px 6px; font-weight: 600; margin-left: auto; }
        .admin-content { padding: 2rem; background: var(--warm-white); }
        .admin-section-title { font-family: 'Cormorant Garamond', serif; font-size: 28px; font-weight: 400; margin-bottom: 1.5rem; }
        .admin-stats { display: grid; grid-template-columns: repeat(4,1fr); gap: 14px; margin-bottom: 2rem; }
        .admin-stat { background: white; border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; }
        .admin-stat-label { font-size: 12px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.06em; color: var(--mid); margin-bottom: 6px; }
        .admin-stat-val { font-size: 28px; font-weight: 300; font-family: 'Cormorant Garamond', serif; }
        .admin-stat-sub { font-size: 12px; color: var(--sage); margin-top: 2px; }
        .admin-table { background: white; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
        .admin-table-head { background: var(--cream); padding: 11px 1.25rem; display: flex; gap: .75rem; font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.06em; color: var(--mid); border-bottom: 1px solid var(--border); }
        .admin-table-row { padding: 13px 1.25rem; display: flex; gap: .75rem; border-bottom: 1px solid var(--border); font-size: 14px; align-items: center; }
        .admin-table-row:last-child { border-bottom: none; }
        .admin-table-row:hover { background: var(--cream); }
        .col-wide { flex: 2.5; font-weight: 500; min-width: 0; }
        .col-med { flex: 1.5; color: var(--mid); min-width: 0; font-size: 13px; }
        .col-sm { flex: 1; color: var(--mid); min-width: 0; font-size: 13px; }
        .col-act { flex: 1.2; display: flex; gap: 6px; justify-content: flex-end; align-items: center; flex-shrink: 0; }
        .tbl-btn { font-size: 11px; border: 1px solid var(--border-strong); background: none; border-radius: 6px; padding: 4px 9px; cursor: pointer; color: var(--charcoal); white-space: nowrap; }
        .status-pill { font-size: 11px; font-weight: 500; padding: 3px 9px; border-radius: 20px; white-space: nowrap; }
        .status-pill.paid { background: var(--sage-light); color: var(--sage-dark); }
        .status-pill.pending { background: var(--gold-light); color: #7A5A10; }
        .status-pill.ready { background: #E8F5E9; color: #2E7D32; }
        .status-pill.unfulfilled { background: #F5F5F5; color: var(--mid); }
        .fulfill-check { width: 20px; height: 20px; border-radius: 5px; border: 2px solid var(--border-strong); background: white; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: all 0.15s; font-size: 11px; color: white; }
        .fulfill-check.done { background: var(--sage); border-color: var(--sage); }

        .sheet-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
        .print-btn { background: var(--charcoal); color: white; border: none; border-radius: 8px; padding: 9px 18px; font-size: 13px; font-weight: 500; cursor: pointer; }
        .prod-sheet-table { background: white; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
        .prod-sheet-row { display: flex; padding: 12px 1.25rem; border-bottom: 1px solid var(--border); font-size: 14px; align-items: center; }
        .prod-sheet-row:last-child { border-bottom: none; }
        .prod-sheet-row.head { background: var(--charcoal); color: white; border-radius: 12px 12px 0 0; font-size: 12px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.06em; }
        .prod-sheet-row.subtotal { background: var(--sage-light); font-weight: 500; }
        .prod-sheet-row.grand { background: var(--charcoal); color: white; border-radius: 0 0 12px 12px; }
        .psr-product { flex: 3; }
        .psr-style { flex: 2; opacity: 0.6; }
        .psr-qty { flex: 1; text-align: right; font-size: 18px; font-weight: 500; font-family: 'Cormorant Garamond', serif; }
        .pack-sheet-card { background: white; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; margin-bottom: 12px; }
        .pack-sheet-customer { background: var(--charcoal); color: white; padding: 12px 1.25rem; display: flex; justify-content: space-between; align-items: center; font-size: 14px; font-weight: 500; }
        .pack-item { display: flex; padding: 10px 1.25rem; border-bottom: 1px solid var(--border); font-size: 14px; }
        .pack-item:last-child { border-bottom: none; }
        .pack-item-name { flex: 3; }
        .pack-item-style { flex: 2; color: var(--mid); }
        .pack-item-qty { flex: 1; text-align: right; font-weight: 500; }

        .pts-risk-card { background: white; border: 1px solid var(--border); border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem; }
        .pts-risk-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 14px; margin-top: 1rem; }
        .pts-risk-stat { background: var(--cream); border-radius: 10px; padding: 1rem; text-align: center; }
        .pts-risk-val { font-family: 'Cormorant Garamond', serif; font-size: 28px; font-weight: 300; }
        .pts-risk-label { font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.06em; color: var(--mid); margin-top: 4px; }
        .rewards-table { background: white; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
        .rt-row { display: flex; align-items: center; justify-content: space-between; padding: 13px 1.25rem; border-bottom: 1px solid var(--border); font-size: 14px; }
        .rt-row:last-child { border-bottom: none; }

        .report-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .report-card { background: white; border: 1px solid var(--border); border-radius: 12px; padding: 1.5rem; cursor: pointer; transition: all 0.2s; }
        .report-card:hover { border-color: var(--sage); }
        .sms-flow { display: flex; flex-direction: column; gap: 10px; margin-top: 1rem; }
        .sms-flow-item { display: flex; align-items: flex-start; gap: 12px; padding: 12px 14px; background: var(--cream); border-radius: 10px; font-size: 13px; }
        .sms-flow-num { width: 22px; height: 22px; border-radius: 50%; background: var(--sage); color: white; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 500; flex-shrink: 0; }

        .back-btn { display: flex; align-items: center; gap: 6px; font-size: 14px; color: var(--mid); cursor: pointer; background: none; border: none; padding: 0; margin-bottom: 1.5rem; }
        .request-disclaimer { background: #FFF8EE; border: 1px solid rgba(196,151,58,0.25); border-radius: 8px; padding: 12px 14px; font-size: 13px; color: #7A5A10; line-height: 1.6; margin-bottom: 1.5rem; }
        .req-type-opts { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 1.25rem; }
        .req-type-opt { border: 1.5px solid var(--border); border-radius: 10px; padding: 12px; cursor: pointer; text-align: center; font-size: 13px; color: var(--mid); }
        .req-type-opt.active { border-color: var(--earth); background: #F8F1E9; color: #6E5338; font-weight: 500; }
        .req-type-icon { font-size: 22px; display: block; margin-bottom: 4px; }

        @media(max-width:768px) {
          .checkout-layout { grid-template-columns: 1fr; }
          .account-layout { grid-template-columns: 1fr; }
          .admin-layout { grid-template-columns: 1fr; }
          .admin-sidebar { display: flex; overflow-x: auto; padding: 0.5rem; }
          .admin-stats { grid-template-columns: repeat(2,1fr); }
          .fulfillment-opts { grid-template-columns: 1fr; }
          .form-row { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* ── NOTIFICATION BANNER ── */}
      {notifBanner && (
        <div className="notif-banner">
          <span>🌾</span>
          <span style={{flex:1}}>Get text alerts for bread drops, bake day announcements & pickup reminders.</span>
          <button className="notif-btn" onClick={() => setSmsModalOpen(true)}>Sign up for texts</button>
          <button className="notif-dismiss" onClick={() => setNotifBanner(false)}>✕</button>
        </div>
      )}

      {/* ── NAV ── */}
      <nav className="nav">
        <div className="nav-logo" onClick={() => setView('home')}>
          <div className="logo-mark">E</div>
          Elizabeth & Co.
        </div>
        <div className="nav-links">
          <button className={`nav-link ${view==='home'?'active':''}`} onClick={() => setView('home')}>Shop</button>
          <button className={`nav-link ${view==='account'||view==='confirmation'?'active':''}`} onClick={() => setView('account')}>My Account</button>
          <button className={`nav-link ${view==='admin'?'active':''}`} onClick={() => setView('admin')}>Admin</button>
        </div>
        <div className="nav-right">
          <div className="points-pill" onClick={() => setView('account')}>✦ {userPoints} pts</div>
          <button className="btn-ghost" onClick={() => setView('account')}>{customer?.first_name || 'Sign in'}</button>
          <div className="cart-btn" onClick={() => setCartOpen(true)}>
            🛒
            <span className="cart-badge">{cart.reduce((s,i)=>s+i.quantity,0)}</span>
          </div>
        </div>
      </nav>

      {/* ══════════════════════════════════════════════ HOME */}
      {view === 'home' && (
        <>
          <div className="hero">
            <p className="hero-eyebrow">Upper Yucaipa, CA · Porch Pickup & Local Delivery</p>
            <h1 className="hero-title">Artisan sourdough,<br/>baked with <em>love.</em></h1>
            <p className="hero-sub">100% organic, small-batch loaves crafted from scratch. Order ahead for upcoming bake days.</p>
            <div className="hero-ctas">
              <button className="btn-large btn-large-primary" onClick={() => document.getElementById('shopSection')?.scrollIntoView({behavior:'smooth'})}>Shop the drop</button>
              <button className="btn-large btn-large-outline" onClick={() => setSmsModalOpen(true)}>Get notified</button>
            </div>
            {currentBakeDay && (
              <div className="next-bake" style={{marginTop:'2.5rem'}}>
                <div className="bake-dot"></div>
                <span style={{color:'var(--mid)'}}>Next bake day:</span>
                <strong>{currentBakeDay.label}</strong>
                <button style={{background:'var(--sage)',color:'white',border:'none',borderRadius:'20px',padding:'5px 12px',fontSize:'12px',cursor:'pointer',fontWeight:500}} onClick={() => document.getElementById('shopSection')?.scrollIntoView({behavior:'smooth'})}>Order now</button>
              </div>
            )}
          </div>

          {/* Bake Days */}
          <div className="section">
            <h2 className="section-title">Upcoming Bake Days</h2>
            <div className="bake-days">
              {bakeDays.map(bd => (
                <div
                  key={bd.id}
                  className={`bake-day-card ${bd.is_open ? (currentBakeDay?.id===bd.id ? 'selected' : 'open') : 'locked'}`}
                  onClick={() => bd.is_open && syncBakeDay(bd)}
                >
                  <p className="bake-month">{new Date(bd.bake_date+'T12:00:00').toLocaleString('default',{month:'long'})}</p>
                  <p className="bake-day-num">{new Date(bd.bake_date+'T12:00:00').getDate()}</p>
                  <p className="bake-day-name">{new Date(bd.bake_date+'T12:00:00').toLocaleString('default',{weekday:'long'})}</p>
                  <span className={`bake-status ${bd.is_open?'open':'soon'}`}>{bd.is_open?'Orders open':'Opens soon'}</span>
                  <p className="bake-closing">{bd.is_open ? `Closes 48hrs before` : 'Coming up'}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Shop */}
          <div className="section" id="shopSection">
            {openBakeDays.length > 0 && (
              <div className="bake-selector">
                <span style={{fontSize:13,fontWeight:500}}>📅 Ordering for:</span>
                <div style={{display:'flex',gap:8}}>
                  {openBakeDays.map(bd => (
                    <button key={bd.id} className={`bake-sel-btn ${currentBakeDay?.id===bd.id?'active':''}`} onClick={() => syncBakeDay(bd)}>
                      {bd.label}
                    </button>
                  ))}
                </div>
                <span style={{fontSize:12,color:'var(--mid)',marginLeft:'auto'}}>One bake day per order</span>
              </div>
            )}

            <div className="tabs">
              {['all','sourdough','cookies','misc'].map(cat => (
                <button key={cat} className={`tab ${productFilter===cat?'active':''}`} onClick={() => setProductFilter(cat)}>
                  {cat==='all'?'All':cat==='sourdough'?'Artisan Sourdough':cat==='cookies'?'Cookies':'Misc'}
                </button>
              ))}
            </div>

            <div className="products-grid">
              {filteredProducts.map(p => (
                <div key={p.id} className="product-card">
                  <div className="product-img">{p.emoji}</div>
                  <div className="product-body">
                    <p className="product-category">{p.category==='sourdough'?'Artisan Sourdough':p.category==='cookies'?'Sourdough Cookies':'Accessories'}</p>
                    <p className="product-name">{p.name}</p>
                    <p className="product-desc">{p.description}</p>
                    {p.variants?.length > 0 && (
                      <>
                        <p className="variants-label">Style</p>
                        <div className="variants">
                          {p.variants.map((v,i) => (
                            <button key={v} className={`variant-btn ${(selectedVariants[p.id]||0)===i?'selected':''}`} onClick={() => setSelectedVariants(prev => ({...prev,[p.id]:i}))}>
                              {v}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                    <div className="product-footer">
                      <span className="product-price">${p.price.toFixed(2)}</span>
                      <button className="add-btn" onClick={() => addToCart(p)}>Add to cart</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="pickup-hint">
              <span>📍</span>
              <span>Available for <strong>porch pickup in Upper Yucaipa, CA</strong> or <strong>local delivery</strong> to Yucaipa, Calimesa & Redlands (+$5 fee). Full pickup address shared in your order confirmation text.</span>
            </div>

            <div className="custom-request-banner">
              <div>
                <h4 style={{fontFamily:'Cormorant Garamond, serif',fontSize:20,fontWeight:400,marginBottom:4}}>Need a custom date or bulk order?</h4>
                <p style={{fontSize:13,color:'var(--mid)',fontWeight:300}}>Submit an inquiry and Brynlee will reach out to confirm availability.</p>
              </div>
              <button className="crb-btn" onClick={() => setRequestModalOpen(true)}>Submit a Request</button>
            </div>
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════ CHECKOUT */}
      {view === 'checkout' && (
        <div>
          <div style={{padding:'1.5rem 2rem 0',maxWidth:1000,margin:'0 auto'}}>
            <button className="back-btn" onClick={() => setView('home')}>← Back to shop</button>
          </div>
          <div className="checkout-layout">
            <div>
              {/* Fulfillment */}
              <div className="checkout-section">
                <p className="checkout-section-title">Pickup or Delivery?</p>
                <div className="fulfillment-opts">
                  <div className={`fulfill-opt ${!deliverySelected?'active':''}`} onClick={() => setDeliverySelected(false)}>
                    <div className="fulfill-opt-title">🧺 Porch Pickup <span className="fulfill-badge">Free</span></div>
                    <div className="fulfill-opt-sub">Upper Yucaipa, CA · address in confirmation</div>
                  </div>
                  <div className={`fulfill-opt ${deliverySelected?'active':''}`} onClick={() => setDeliverySelected(true)}>
                    <div className="fulfill-opt-title">🚗 Local Delivery <span className="fulfill-badge" style={{background:'rgba(139,111,78,0.12)',color:'#6E5338'}}>+$5</span></div>
                    <div className="fulfill-opt-sub">Yucaipa · Calimesa · Redlands only</div>
                  </div>
                </div>
                {deliverySelected && (
                  <div style={{marginTop:'1.25rem',paddingTop:'1.25rem',borderTop:'1px solid var(--border)'}}>
                    <div style={{fontSize:12,color:'var(--mid)',background:'var(--cream)',borderRadius:8,padding:'10px 12px',marginBottom:12}}>🚗 Delivery available to <strong>Yucaipa, Calimesa, and Redlands</strong> only. $5 delivery fee added.</div>
                    {customer?.saved_street && !useNewAddress ? (
                      <div style={{background:'white',border:'1.5px solid var(--sage)',borderRadius:10,padding:'12px 14px',display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                        <div>
                          <div style={{fontSize:11,fontWeight:500,textTransform:'uppercase',letterSpacing:'0.06em',color:'var(--sage-dark)',marginBottom:4}}>Saved address</div>
                          <div style={{fontSize:14,fontWeight:500}}>{customer.saved_street}, {customer.saved_city}, CA {customer.saved_zip}</div>
                        </div>
                        <button onClick={() => setUseNewAddress(true)} style={{fontSize:12,color:'var(--sage)',background:'none',border:'none',cursor:'pointer',whiteSpace:'nowrap',marginTop:2}}>Use different</button>
                      </div>
                    ) : (
                      <>
                        <div className="form-group"><label className="form-label">Street address</label><input className="form-input" value={checkoutForm.deliveryStreet} onChange={e => setCheckoutForm(f=>({...f,deliveryStreet:e.target.value}))} placeholder="123 Oak Street" /></div>
                        <div className="form-row">
                          <div className="form-group"><label className="form-label">City</label>
                            <select className="form-input" value={checkoutForm.deliveryCity} onChange={e => setCheckoutForm(f=>({...f,deliveryCity:e.target.value}))}>
                              <option value="">Select city</option>
                              <option>Yucaipa</option><option>Calimesa</option><option>Redlands</option>
                            </select>
                          </div>
                          <div className="form-group"><label className="form-label">ZIP</label><input className="form-input" value={checkoutForm.deliveryZip} onChange={e => setCheckoutForm(f=>({...f,deliveryZip:e.target.value}))} placeholder="92399" /></div>
                        </div>
                        <label style={{display:'flex',alignItems:'center',gap:8,fontSize:13,color:'var(--mid)',cursor:'pointer'}}>
                          <input type="checkbox" checked={checkoutForm.saveAddress} onChange={e => setCheckoutForm(f=>({...f,saveAddress:e.target.checked}))} style={{accentColor:'var(--sage)'}} />
                          Save this address to my account
                        </label>
                        {useNewAddress && <button onClick={() => setUseNewAddress(false)} style={{fontSize:12,color:'var(--sage)',background:'none',border:'none',cursor:'pointer',marginTop:8,padding:0}}>← Use saved address</button>}
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Bake Day */}
              <div className="checkout-section">
                <p className="checkout-section-title">Bake Day</p>
                <div style={{background:'var(--sage-light)',borderRadius:10,padding:'14px 16px'}}>
                  <p style={{fontSize:14,fontWeight:500}}>{currentBakeDay?.label}</p>
                  <p style={{fontSize:13,color:'var(--mid)',marginTop:2}}>Order cutoff: 48hrs before · <span style={{color:'var(--sage)',cursor:'pointer'}} onClick={() => setView('home')}>Change bake day</span></p>
                </div>
              </div>

              {/* Contact */}
              <div className="checkout-section">
                <p className="checkout-section-title">Contact Info</p>
                <div className="form-row">
                  <div className="form-group"><label className="form-label">First name</label><input className="form-input" value={checkoutForm.firstName} onChange={e => setCheckoutForm(f=>({...f,firstName:e.target.value}))} /></div>
                  <div className="form-group"><label className="form-label">Last name</label><input className="form-input" value={checkoutForm.lastName} onChange={e => setCheckoutForm(f=>({...f,lastName:e.target.value}))} /></div>
                </div>
                <div className="form-group"><label className="form-label">Email</label><input className="form-input" value={checkoutForm.email} onChange={e => setCheckoutForm(f=>({...f,email:e.target.value}))} /></div>
                <div className="form-group"><label className="form-label">Phone (for text updates)</label><input className="form-input" value={checkoutForm.phone} onChange={e => setCheckoutForm(f=>({...f,phone:e.target.value}))} /></div>
              </div>

              {/* Payment */}
              <div className="checkout-section">
                <p className="checkout-section-title">Payment</p>
                <div className="payment-opts">
                  {[{id:'card',icon:'💳',label:'Card'},{id:'gpay',icon:'G',label:'Google Pay'},{id:'apple',icon:'',label:'Apple Pay'},{id:'cashapp',icon:'$',label:'Cash App'},{id:'zelle',icon:'⚡',label:'Zelle'},{id:'venmo',icon:'V',label:'Venmo'}].map(p => (
                    <div key={p.id} className={`pay-opt ${selectedPayment===p.id?'active':''}`} onClick={() => setSelectedPayment(p.id)}>
                      <span className="pay-opt-icon">{p.icon}</span>
                      <span>{p.label}</span>
                    </div>
                  ))}
                </div>
                {selectedPayment === 'card' && (
                  <div style={{marginTop:'1.25rem'}}>
                    <div className="form-group"><label className="form-label">Card number</label><input className="form-input" placeholder="•••• •••• •••• ••••" /></div>
                    <div className="form-row">
                      <div className="form-group"><label className="form-label">Expiry</label><input className="form-input" placeholder="MM / YY" /></div>
                      <div className="form-group"><label className="form-label">CVC</label><input className="form-input" placeholder="•••" /></div>
                    </div>
                    <label style={{display:'flex',alignItems:'center',gap:8,fontSize:13,color:'var(--mid)',cursor:'pointer',marginTop:4}}><input type="checkbox" style={{accentColor:'var(--sage)'}} /> Save card to my account</label>
                  </div>
                )}
                {selectedPayment === 'zelle' && (
                  <div className="pay-instructions"><strong style={{display:'block',marginBottom:4}}>⚡ Pay via Zelle</strong>Send to <strong>elizabethandco@gmail.com</strong>. Include your order number in the memo. We'll confirm once payment is received.</div>
                )}
                {selectedPayment === 'venmo' && (
                  <div className="pay-instructions"><strong style={{display:'block',marginBottom:4}}>V Pay via Venmo</strong>Send to <strong>@ElizabethandCo-Bread</strong>. Include your name and bake date in the note. We'll confirm once received.</div>
                )}
                {['gpay','apple','cashapp'].includes(selectedPayment) && (
                  <div className="pay-instructions"><strong style={{display:'block',marginBottom:4}}>Digital payment selected</strong>You'll be prompted to complete payment securely on the next step.</div>
                )}
              </div>

              <div className="checkout-section">
                <p className="checkout-section-title">Order Notes</p>
                <textarea className="form-input" rows={2} style={{resize:'none',height:'auto'}} placeholder="Any special requests or notes for Brynlee..." value={checkoutForm.notes} onChange={e => setCheckoutForm(f=>({...f,notes:e.target.value}))} />
              </div>

              {/* SMS auto-enroll */}
              <div className="checkout-section" style={{background:'var(--sage-light)',borderColor:'rgba(107,124,92,0.25)'}}>
                <p className="checkout-section-title" style={{color:'var(--sage-dark)'}}>Text Notifications</p>
                <p style={{fontSize:13,color:'var(--sage-dark)',marginBottom:'1rem',fontWeight:300}}>We'll text you updates. Uncheck anything you don't want.</p>
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  {[
                    {key:'smsConfirmation',label:'Order confirmation & receipt'},
                    {key:'smsPickup',label:'Pickup day reminder with address'},
                    {key:'smsReady',label:'Order ready notification'},
                    {key:'smsPromos',label:'Promos & upcoming bake days'}
                  ].map(opt => (
                    <label key={opt.key} style={{display:'flex',alignItems:'center',gap:10,fontSize:13,cursor:'pointer'}}>
                      <input type="checkbox" checked={checkoutForm[opt.key]} onChange={e => setCheckoutForm(f=>({...f,[opt.key]:e.target.checked}))} style={{width:15,height:15,accentColor:'var(--sage)'}} />
                      {opt.label}
                    </label>
                  ))}
                </div>
                <p style={{fontSize:11,color:'var(--sage-dark)',marginTop:10,opacity:0.7}}>Reply STOP anytime to unsubscribe.</p>
              </div>
            </div>

            {/* Order summary */}
            <div className="order-summary-sticky">
              <div className="order-summary-card">
                <p className="summary-title">Order Summary</p>
                {cart.map((item,i) => (
                  <div key={i} className="summary-item">
                    <div className="summary-item-img">{item.emoji}</div>
                    <div style={{flex:1}}>
                      <div className="summary-item-name">{item.product_name}</div>
                      <div className="summary-item-sub">{item.variant ? item.variant+' · ' : ''}×{item.quantity}</div>
                    </div>
                    <div className="summary-item-price">${(item.unit_price*item.quantity).toFixed(2)}</div>
                  </div>
                ))}

                {/* Points redemption */}
                <div className="pts-box">
                  <div className="pts-header" onClick={() => setPtsPanelOpen(p => !p)}>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <span style={{fontSize:16}}>✦</span>
                      <div>
                        <div style={{fontSize:13,fontWeight:500,color:'#7A5A10'}}>Redeem Reward Points</div>
                        <div style={{fontSize:12,color:'#8A6020'}}>{userPoints} pts available</div>
                      </div>
                    </div>
                    <button className={`pts-toggle ${ptsPanelOpen?'on':'off'}`} onClick={e => { e.stopPropagation(); setPtsPanelOpen(p => !p); }}></button>
                  </div>
                  {ptsPanelOpen && (
                    <div className="pts-detail">
                      <p style={{fontSize:12,color:'var(--mid)',marginBottom:10,lineHeight:1.5}}>Choose one discount block. Points used in full, no splitting.</p>
                      {rewardBlocks.map(r => {
                        const canAfford = userPoints >= r.points_required
                        const isSelected = redeemedBlock?.id === r.id
                        const best = [...rewardBlocks].filter(b => userPoints >= b.points_required).pop()
                        const isBest = best?.id === r.id
                        return (
                          <div key={r.id} className="pts-item-row" style={{opacity:canAfford?1:0.4,marginBottom:8}}>
                            <div style={{display:'flex',alignItems:'center',gap:6}}>
                              <span style={{fontSize:13,fontWeight:canAfford?500:400}}>{r.label}</span>
                              {isBest && !isSelected && <span style={{fontSize:10,background:'var(--sage-light)',color:'var(--sage-dark)',padding:'2px 6px',borderRadius:10,fontWeight:500}}>Best</span>}
                              <span style={{fontSize:11,color:'var(--mid)'}}>{r.points_required} pts</span>
                            </div>
                            {canAfford
                              ? <button className={`pts-redeem-btn ${isSelected?'applied':''}`} onClick={() => setRedeemedBlock(isSelected ? null : r)}>{isSelected?'✓ Applied':'Apply'}</button>
                              : <span className="pts-cannot">Need {r.points_required-userPoints} more</span>
                            }
                          </div>
                        )
                      })}
                      <div className="pts-after">Points after order: <span style={{color:'var(--sage-dark)',fontWeight:500}}>{userPoints - (redeemedBlock?.points_required||0)}</span> pts</div>
                    </div>
                  )}
                </div>

                <div className="summary-lines" style={{marginTop:12}}>
                  <div className="summary-line"><span>Subtotal</span><span>${sub.toFixed(2)}</span></div>
                  {deliverySelected && <div className="summary-line"><span>🚗 Delivery fee</span><span>$5.00</span></div>}
                  {redeemedBlock && <div className="summary-line" style={{color:'var(--sage-dark)'}}><span>🏅 {redeemedBlock.label}</span><span>-${redeemedBlock.discount_value.toFixed(2)}</span></div>}
                  <div className="summary-line"><span>Tax (8.5%)</span><span>${tax.toFixed(2)}</span></div>
                  <div className="summary-total"><span>Total</span><span>${total.toFixed(2)}</span></div>
                  <div style={{fontSize:11,color:'var(--sage)',marginTop:6,textAlign:'right'}}>+{Math.floor(sub)} points earned on this order</div>
                </div>
                <button className="checkout-btn" onClick={placeOrder}>Place Order</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════ CONFIRMATION */}
      {view === 'confirmation' && confirmation && (
        <div className="confirmation-wrap">
          <div className="confirmation-icon">🎉</div>
          <h1 className="confirmation-title">Order confirmed!</h1>
          <p className="confirmation-sub">Thank you, {customer?.first_name}! We'll see you {currentBakeDay?.label}.<br/>A text confirmation has been sent to {checkoutForm.phone}.</p>
          <div className="confirmation-card">
            <p className="conf-label">Order #{confirmation.orderNumber}</p>
            {cart.length === 0 && <p style={{fontSize:13,color:'var(--mid)'}}>Your order has been placed successfully.</p>}
            <div style={{display:'flex',justifyContent:'space-between',fontSize:14,color:'var(--mid)',marginBottom:4,marginTop:8}}><span>Subtotal</span><span>${confirmation.sub.toFixed(2)}</span></div>
            {deliverySelected && <div style={{display:'flex',justifyContent:'space-between',fontSize:14,color:'var(--mid)',marginBottom:4}}><span>Delivery fee</span><span>$5.00</span></div>}
            <div style={{display:'flex',justifyContent:'space-between',fontSize:14,color:'var(--mid)',marginBottom:4}}><span>Tax</span><span>${confirmation.tax}</span></div>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:16,fontWeight:500,paddingTop:10,borderTop:'1px solid var(--border)'}}><span>Total</span><span>${confirmation.total}</span></div>
          </div>
          <div className="confirmation-card">
            <p className="conf-label">Pickup Details</p>
            <div className="conf-address-box">
              <div style={{fontSize:15,fontWeight:500}}>123 Willow Lane, Upper Yucaipa, CA 92399</div>
              <div style={{fontSize:13,color:'var(--mid)',marginTop:3}}>{currentBakeDay?.label} · {currentBakeDay?.pickup_start} – {currentBakeDay?.pickup_end}</div>
            </div>
            <p style={{fontSize:13,color:'var(--mid)',marginTop:10}}>Look for the signage at the front porch. Questions? Text us at (909) 555-0100.</p>
          </div>
          <div className="sms-note">
            <span style={{fontSize:18}}>📱</span>
            <span>You'll receive a <strong>text reminder</strong> the day before with your full pickup details.</span>
          </div>
          <div style={{display:'flex',gap:12,justifyContent:'center',flexWrap:'wrap',marginTop:'1.5rem'}}>
            <button className="btn-large btn-large-primary" onClick={() => setView('home')}>Continue shopping</button>
            <button className="btn-large btn-large-outline" onClick={() => setView('account')}>View my orders</button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════ ACCOUNT */}
      {view === 'account' && (
        <div className="account-layout">
          <div>
            <div className="account-avatar">{customer ? customer.first_name[0]+customer.last_name[0] : 'SM'}</div>
            <div style={{fontSize:18,fontWeight:500}}>{customer?.first_name} {customer?.last_name}</div>
            <div style={{fontSize:13,color:'var(--mid)',marginTop:2}}>{customer?.email}</div>
            <div className="account-points-card">
              <div style={{fontSize:11,fontWeight:500,textTransform:'uppercase',letterSpacing:'0.08em',color:'#8A5E10'}}>✦ Reward Points</div>
              <div className="apt-val">{userPoints}</div>
              <div style={{fontSize:12,color:'var(--mid)',marginTop:4}}>Earn 1 pt per $1 spent</div>
              <div style={{marginTop:10,fontSize:11,color:'var(--mid)'}}>$5 off = 100 pts · $10 off = 200 pts<br/>$20 off = 400 pts · $50 off = 1,000 pts</div>
            </div>
            <div className="account-nav">
              {[{id:'orders',icon:'📦',label:'Order History'},{id:'notifications',icon:'🔔',label:'Notifications'},{id:'payment',icon:'💳',label:'Saved Payment'},{id:'profile',icon:'👤',label:'Profile'}].map(t => (
                <button key={t.id} className={`account-nav-item ${acctTab===t.id?'active':''}`} onClick={() => setAcctTab(t.id)}>{t.icon} {t.label}</button>
              ))}
            </div>
          </div>
          <div>
            {acctTab === 'orders' && (
              <>
                <h2 style={{fontFamily:'Cormorant Garamond, serif',fontSize:26,fontWeight:400,marginBottom:'1.5rem'}}>Order History</h2>
                {orders.length === 0 ? <p style={{color:'var(--mid)',fontSize:13}}>No orders yet. <span style={{color:'var(--sage)',cursor:'pointer'}} onClick={() => setView('home')}>Shop the current drop →</span></p> : orders.map(o => (
                  <div key={o.id} className="order-hist-item">
                    <div>
                      <div style={{fontSize:12,fontWeight:500,color:'var(--mid)',fontFamily:'monospace'}}>#{o.order_number}</div>
                      <div style={{fontSize:13,fontWeight:500,marginTop:2}}>{o.bake_days?.label}</div>
                      <div style={{fontSize:13,color:'var(--mid)',marginTop:4}}>{o.order_items?.map(i => `${i.quantity}× ${i.product_name}${i.variant?' ('+i.variant+')':''}`).join(', ')}</div>
                      <div style={{fontSize:15,fontWeight:500,marginTop:8}}>${o.total.toFixed(2)}</div>
                      <button className="reorder-btn" onClick={() => setView('home')}>+ Reorder</button>
                    </div>
                    <span className={`order-status ${o.fulfillment_status}`}>{o.fulfillment_status}</span>
                  </div>
                ))}
              </>
            )}
            {acctTab === 'notifications' && (
              <>
                <h2 style={{fontFamily:'Cormorant Garamond, serif',fontSize:26,fontWeight:400,marginBottom:'1.5rem'}}>Notification Preferences</h2>
                {[{key:'sms_announcements',label:'Bake day announcements',sub:'When new drops open for ordering'},{key:'sms_closing_reminders',label:'Order closing reminders',sub:'Before the cutoff deadline'},{key:'sms_pickup_reminders',label:'Pickup & delivery reminders',sub:'Morning of pickup with full address'},{key:'sms_order_ready',label:'Order ready notifications',sub:'Text when your order is packed'},{key:'sms_promos',label:'Promotions & specials',sub:'Seasonal drops, limited items, deals'}].map(opt => (
                  <div key={opt.key} className="sms-opt">
                    <div className={`sms-check ${customer?.[opt.key]?'checked':''}`}>{customer?.[opt.key]?'✓':''}</div>
                    <div style={{flex:1,fontSize:14}}><div>{opt.label}</div><div style={{fontSize:12,color:'var(--mid)',fontWeight:300}}>{opt.sub}</div></div>
                  </div>
                ))}
              </>
            )}
            {acctTab === 'payment' && (
              <>
                <h2 style={{fontFamily:'Cormorant Garamond, serif',fontSize:26,fontWeight:400,marginBottom:'1.5rem'}}>Saved Payment</h2>
                <div style={{background:'white',border:'1px solid var(--border)',borderRadius:12,padding:'1.25rem',display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                  <div style={{display:'flex',gap:12,alignItems:'center'}}><div style={{width:40,height:26,background:'#1A1F71',borderRadius:5}}></div><div><div style={{fontSize:14,fontWeight:500}}>Visa ending in 4291</div><div style={{fontSize:12,color:'var(--mid)'}}>Expires 09/27</div></div></div>
                  <div style={{fontSize:11,background:'var(--sage-light)',color:'var(--sage-dark)',padding:'4px 10px',borderRadius:20,fontWeight:500}}>Default</div>
                </div>
                <button className="btn-ghost">+ Add new card</button>
              </>
            )}
            {acctTab === 'profile' && (
              <>
                <h2 style={{fontFamily:'Cormorant Garamond, serif',fontSize:26,fontWeight:400,marginBottom:'1.5rem'}}>Profile</h2>
                <div style={{background:'white',border:'1px solid var(--border)',borderRadius:12,padding:'1.5rem',maxWidth:480}}>
                  <div className="form-row">
                    <div className="form-group"><label className="form-label">First name</label><input className="form-input" defaultValue={customer?.first_name} /></div>
                    <div className="form-group"><label className="form-label">Last name</label><input className="form-input" defaultValue={customer?.last_name} /></div>
                  </div>
                  <div className="form-group"><label className="form-label">Email</label><input className="form-input" defaultValue={customer?.email} /></div>
                  <div className="form-group"><label className="form-label">Phone</label><input className="form-input" defaultValue={customer?.phone} /></div>
                  <div className="form-group"><label className="form-label">ZIP code</label><input className="form-input" defaultValue={customer?.zip_code} /></div>
                  <button className="btn-primary" style={{marginTop:8}}>Save changes</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════ ADMIN */}
      {view === 'admin' && (
        <>
          <div className="admin-bar">
            <span style={{fontWeight:500,letterSpacing:'0.04em'}}>Elizabeth & Co. — Admin Console</span>
            <span style={{fontSize:12,color:'rgba(255,255,255,0.6)',cursor:'pointer'}} onClick={() => setView('home')}>← Exit to storefront</span>
          </div>
          <div className="admin-layout">
            <div className="admin-sidebar">
              {[{id:'dashboard',icon:'📊',label:'Dashboard'},{id:'products',icon:'🍞',label:'Products'},{id:'bakedays',icon:'📅',label:'Bake Days'},{id:'orders',icon:'📦',label:'Orders & Fulfillment'},{id:'requests',icon:'📬',label:'Custom Requests',badge:true},{id:'customers',icon:'👥',label:'Customers'},{id:'rewards',icon:'✦',label:'Rewards'},{id:'reports',icon:'📈',label:'Reports'},{id:'sms',icon:'📱',label:'SMS & Notifications'},{id:'settings',icon:'⚙️',label:'Settings'}].map(t => (
                <button key={t.id} className={`admin-nav-item ${adminTab===t.id?'active':''}`} onClick={() => { setAdminTab(t.id); if(t.id==='orders'&&adminBakeDay) loadAdminOrders(adminBakeDay.id); }}>
                  {t.icon} {t.label} {t.badge && <span className="badge-red">3</span>}
                </button>
              ))}
            </div>
            <div className="admin-content">

              {adminTab === 'dashboard' && (
                <>
                  <h2 className="admin-section-title">Dashboard</h2>
                  <div className="admin-stats">
                    <div className="admin-stat"><div className="admin-stat-label">Revenue MTD</div><div className="admin-stat-val">$4,210</div><div className="admin-stat-sub">↑ 18% vs last month</div></div>
                    <div className="admin-stat"><div className="admin-stat-label">Orders MTD</div><div className="admin-stat-val">148</div><div className="admin-stat-sub">↑ 12 this bake</div></div>
                    <div className="admin-stat"><div className="admin-stat-label">Active Customers</div><div className="admin-stat-val">94</div><div className="admin-stat-sub">12 new this month</div></div>
                    <div className="admin-stat"><div className="admin-stat-label">Open Orders</div><div className="admin-stat-val">{adminOrders.length || '—'}</div><div className="admin-stat-sub">Current bake day</div></div>
                  </div>
                </>
              )}

              {adminTab === 'orders' && (
                <>
                  <h2 className="admin-section-title">Orders & Fulfillment</h2>
                  <div style={{display:'flex',gap:8,marginBottom:'1.5rem',flexWrap:'wrap',alignItems:'center'}}>
                    <span style={{fontSize:13,color:'var(--mid)'}}>Bake day:</span>
                    {bakeDays.filter(d=>d.is_open).map(bd => (
                      <button key={bd.id} className={`bake-sel-btn ${adminBakeDay?.id===bd.id?'active':''}`} onClick={() => { setAdminBakeDay(bd); loadAdminOrders(bd.id); }}>
                        {bd.label}
                      </button>
                    ))}
                  </div>
                  <div className="tabs" style={{maxWidth:420}}>
                    {['list','prod','pack'].map(m => (
                      <button key={m} className={`tab ${adminOrdersView===m?'active':''}`} onClick={() => setAdminOrdersView(m)}>
                        {m==='list'?'Order List':m==='prod'?'Production Sheet':'Packing Sheet'}
                      </button>
                    ))}
                  </div>

                  {adminOrdersView === 'list' && (
                    <>
                      <p style={{fontSize:12,color:'var(--mid)',marginBottom:'1rem'}}>Check off orders when packed — customer receives an automatic text.</p>
                      <div className="admin-table">
                        <div className="admin-table-head">
                          <span style={{width:24,flexShrink:0}}></span>
                          <span className="col-wide">Customer</span>
                          <span className="col-med">Items</span>
                          <span className="col-sm">Type</span>
                          <span className="col-sm">Total</span>
                          <span className="col-sm">Payment</span>
                          <span className="col-act">Status</span>
                        </div>
                        {adminOrders.map(o => (
                          <div key={o.id} className="admin-table-row">
                            <div className={`fulfill-check ${o.fulfillment_status==='ready'?'done':''}`} onClick={() => o.fulfillment_status!=='ready' && markOrderReady(o.id, `${o.customers?.first_name} ${o.customers?.last_name}`, o.customers?.phone)}>
                              {o.fulfillment_status==='ready'?'✓':''}
                            </div>
                            <span className="col-wide">{o.customers?.first_name} {o.customers?.last_name}</span>
                            <span className="col-med">{o.order_items?.length} items</span>
                            <span className="col-sm">{o.fulfillment_type==='delivery'?'🚗 Delivery':'🧺 Pickup'}</span>
                            <span className="col-sm">${o.total.toFixed(2)}</span>
                            <span className="col-sm"><span className={`status-pill ${o.payment_status}`}>{o.payment_method}</span></span>
                            <span className="col-act"><span className={`status-pill ${o.fulfillment_status}`}>{o.fulfillment_status}</span></span>
                          </div>
                        ))}
                        {adminOrders.length === 0 && <div style={{padding:'2rem',textAlign:'center',color:'var(--mid)',fontSize:13}}>No orders yet for this bake day.</div>}
                      </div>
                      <p style={{fontSize:12,color:'var(--sage-dark)',marginTop:10,fontStyle:'italic'}}>✓ Checking an order automatically sends a pickup ready text to the customer.</p>
                    </>
                  )}

                  {adminOrdersView === 'prod' && (
                    <>
                      <div className="sheet-header">
                        <div><h3 style={{fontSize:18,fontWeight:500}}>Production Sheet — {adminBakeDay?.label}</h3><p style={{fontSize:13,color:'var(--mid)',marginTop:2}}>Total quantities to bake.</p></div>
                        <button className="print-btn" onClick={() => window.print()}>🖨️ Print / Save PDF</button>
                      </div>
                      <div className="prod-sheet-table">
                        <div className="prod-sheet-row head"><span className="psr-product">Product</span><span className="psr-style">Style</span><span className="psr-qty" style={{fontSize:12,fontFamily:'DM Sans,sans-serif'}}>Qty</span></div>
                        {(() => {
                          const totals = {}
                          adminOrders.forEach(o => o.order_items?.forEach(i => {
                            const key = i.product_name + '|' + (i.variant||'')
                            totals[key] = (totals[key]||0) + i.quantity
                          }))
                          const byProduct = {}
                          Object.entries(totals).forEach(([k,v]) => {
                            const [name,variant] = k.split('|')
                            if(!byProduct[name]) byProduct[name] = []
                            byProduct[name].push({variant,qty:v})
                          })
                          const grandTotal = Object.values(totals).reduce((s,v)=>s+v,0)
                          return (<>
                            {Object.entries(byProduct).map(([name,variants]) => (
                              <>
                                {variants.map(v => <div key={name+v.variant} className="prod-sheet-row"><span className="psr-product">{name}</span><span className="psr-style">{v.variant||'—'}</span><span className="psr-qty">{v.qty}</span></div>)}
                                <div className="prod-sheet-row subtotal"><span className="psr-product">{name} — TOTAL</span><span className="psr-style"></span><span className="psr-qty" style={{color:'var(--sage-dark)'}}>{variants.reduce((s,v)=>s+v.qty,0)}</span></div>
                              </>
                            ))}
                            <div className="prod-sheet-row grand"><span className="psr-product" style={{color:'white',fontWeight:500}}>GRAND TOTAL</span><span className="psr-style"></span><span className="psr-qty" style={{color:'white',fontFamily:'DM Sans,sans-serif',fontSize:22,fontWeight:500}}>{grandTotal}</span></div>
                          </>)
                        })()}
                        {adminOrders.length===0 && <div style={{padding:'2rem',textAlign:'center',color:'var(--mid)',fontSize:13}}>No orders to show.</div>}
                      </div>
                    </>
                  )}

                  {adminOrdersView === 'pack' && (
                    <>
                      <div className="sheet-header">
                        <div><h3 style={{fontSize:18,fontWeight:500}}>Packing Sheet — {adminBakeDay?.label}</h3><p style={{fontSize:13,color:'var(--mid)',marginTop:2}}>Per-customer breakdown. Use to sort and label bags.</p></div>
                        <button className="print-btn" onClick={() => window.print()}>🖨️ Print / Save PDF</button>
                      </div>
                      {adminOrders.map(o => (
                        <div key={o.id} className="pack-sheet-card">
                          <div className="pack-sheet-customer">
                            <span>{o.customers?.first_name} {o.customers?.last_name} {o.fulfillment_status==='ready'?'✓':''}</span>
                            <span style={{fontSize:12,opacity:0.7}}>{o.fulfillment_type==='delivery'?`🚗 Delivery — ${o.delivery_city}`:'🧺 Pickup'} · {o.payment_method}</span>
                          </div>
                          {o.order_items?.map(i => (
                            <div key={i.id} className="pack-item">
                              <span className="pack-item-name">{i.product_name}</span>
                              <span className="pack-item-style">{i.variant||'—'}</span>
                              <span className="pack-item-qty">×{i.quantity}</span>
                            </div>
                          ))}
                          <div style={{padding:'8px 1.25rem',fontSize:12,color:'var(--mid)'}}>Total: ${o.total.toFixed(2)}{o.delivery_fee>0?` · Delivery: $${o.delivery_fee}`:''}</div>
                        </div>
                      ))}
                      {adminOrders.length===0 && <p style={{color:'var(--mid)',fontSize:13}}>No orders to show.</p>}
                    </>
                  )}
                </>
              )}

              {adminTab === 'rewards' && (
                <>
                  <h2 className="admin-section-title">Rewards Program</h2>
                  <div className="pts-risk-card">
                    <p style={{fontSize:14,fontWeight:500}}>Outstanding Points — Liability Overview</p>
                    <p style={{fontSize:13,color:'var(--mid)',marginTop:4}}>Points represent future discount value.</p>
                    <div className="pts-risk-grid">
                      <div className="pts-risk-stat"><div className="pts-risk-val">{userPoints}</div><div className="pts-risk-label">Your Points</div></div>
                      <div className="pts-risk-stat"><div className="pts-risk-val">2,037</div><div className="pts-risk-label">All Customers</div></div>
                      <div className="pts-risk-stat" style={{background:'var(--gold-light)'}}><div className="pts-risk-val" style={{color:'#8A5E10'}}>~$102</div><div className="pts-risk-label" style={{color:'#8A5E10'}}>Max Liability</div></div>
                    </div>
                  </div>
                  <div className="rewards-table">
                    <div className="rt-row" style={{background:'var(--charcoal)',borderRadius:'12px 12px 0 0'}}>
                      <span style={{fontWeight:500,color:'white',fontSize:12,textTransform:'uppercase',letterSpacing:'0.06em'}}>Discount Block</span>
                      <span style={{fontWeight:500,color:'white',fontSize:12,textTransform:'uppercase',letterSpacing:'0.06em'}}>Points Required</span>
                      <span></span>
                    </div>
                    {rewardBlocks.map(r => (
                      <div key={r.id} className="rt-row">
                        <span style={{fontWeight:500}}>{r.label}</span>
                        <span style={{fontWeight:500,color:'#8A5E10'}}>{r.points_required} pts</span>
                        <span style={{fontSize:12,color:'var(--sage)',cursor:'pointer'}}>Edit</span>
                      </div>
                    ))}
                  </div>
                  <button className="add-bake-btn" style={{marginTop:'1rem',background:'var(--sage)',color:'white',border:'none',borderRadius:10,padding:'12px 22px',fontSize:14,fontWeight:500,cursor:'pointer'}}>+ Add Reward Block</button>
                </>
              )}

              {adminTab === 'reports' && (
                <>
                  <h2 className="admin-section-title">Reports</h2>
                  <div className="report-grid">
                    {[{icon:'📈',name:'Best Sellers by Date',desc:'Products and variants ranked by volume, filterable by date range.'},{icon:'🗓',name:'Seasonal Trends',desc:'Monthly patterns to forecast demand and plan baking schedules.'},{icon:'📍',name:'Customer Location Map',desc:'ZIP code heatmap showing where orders come from.'},{icon:'👥',name:'Customer Retention',desc:'Return rate, order frequency, and top repeat customers.'},{icon:'✦',name:'Points & Redemptions',desc:'Points issued, redeemed, outstanding, and redemption rates.'},{icon:'🚗',name:'Pickup vs Delivery',desc:'Split of order types, delivery revenue, city breakdown.'}].map(r => (
                      <div key={r.name} className="report-card">
                        <div style={{fontSize:28,marginBottom:10}}>{r.icon}</div>
                        <div style={{fontSize:16,fontWeight:500}}>{r.name}</div>
                        <div style={{fontSize:13,color:'var(--mid)',marginTop:4,lineHeight:1.5,fontWeight:300}}>{r.desc}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {adminTab === 'sms' && (
                <>
                  <h2 className="admin-section-title">SMS & Notifications</h2>
                  <div style={{background:'white',border:'1px solid var(--border)',borderRadius:12,padding:'1.5rem',marginBottom:'1.5rem'}}>
                    <h4 style={{fontSize:16,fontWeight:500,marginBottom:6}}>How SMS Works — Twilio Integration</h4>
                    <p style={{fontSize:13,color:'var(--mid)',lineHeight:1.7,marginBottom:'1rem'}}>All texts fire automatically via Twilio (~$0.01/text). Once your developer sets up the API route, no action needed from you.</p>
                    <div className="sms-flow">
                      {[{n:1,t:'Order placed → Immediate confirmation text with order number and payment instructions if Zelle/Venmo.'},{n:2,t:'Day before pickup → Automated text to all customers with full pickup address and window.'},{n:3,t:'Order marked Ready ✓ → Instant text: "Your order is packed! Pick up at 123 Willow Lane between 11am–3pm. 🍞"'},{n:4,t:'Manual blasts → Send custom messages below to any subscriber segment.'}].map(s => (
                        <div key={s.n} className="sms-flow-item"><div className="sms-flow-num">{s.n}</div><div style={{fontSize:13}}>{s.t}</div></div>
                      ))}
                    </div>
                  </div>
                  <div style={{background:'white',border:'1px solid var(--border)',borderRadius:12,padding:'1.5rem'}}>
                    <p style={{fontSize:14,fontWeight:500,marginBottom:'1.25rem'}}>Send a Manual Message</p>
                    <div className="form-group"><label className="form-label">Audience</label>
                      <select className="form-input"><option>All SMS subscribers</option><option>Customers with orders on next bake day</option><option>Customers with pending Zelle/Venmo payment</option></select>
                    </div>
                    <div className="form-group"><label className="form-label">Message</label>
                      <textarea className="form-input" rows={3} style={{height:'auto',resize:'none'}} defaultValue="Hey! Orders for our next bake day are now open — order at elizabethandco.com 🍞" />
                    </div>
                    <div style={{display:'flex',gap:10,marginTop:8,justifyContent:'flex-end'}}>
                      <button className="btn-ghost">Preview</button>
                      <button style={{background:'var(--sage)',color:'white',border:'none',borderRadius:10,padding:'10px 20px',fontSize:14,fontWeight:500,cursor:'pointer'}}>Send Now</button>
                    </div>
                  </div>
                </>
              )}

              {adminTab === 'bakedays' && (
                <>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.5rem'}}>
                    <h2 className="admin-section-title" style={{margin:0}}>Bake Days</h2>
                    <button style={{background:'var(--sage)',color:'white',border:'none',borderRadius:10,padding:'10px 20px',fontSize:14,fontWeight:500,cursor:'pointer'}}>+ Schedule Bake Day</button>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:14,marginBottom:'1.5rem'}}>
                    {bakeDays.map(bd => (
                      <div key={bd.id} style={{background:'white',border:`1px solid ${bd.is_open?'var(--sage)':'var(--border)'}`,borderRadius:12,padding:'1.25rem'}}>
                        <div style={{fontFamily:'Cormorant Garamond, serif',fontSize:22,fontWeight:400}}>{bd.label}</div>
                        <div style={{fontSize:13,color:'var(--mid)',marginTop:4}}>Pickup: {bd.pickup_start} – {bd.pickup_end}</div>
                        <div style={{display:'flex',alignItems:'center',gap:8,marginTop:10}}>
                          <span className={`bake-status ${bd.is_open?'open':'soon'}`}>{bd.is_open?'Open':'Upcoming'}</span>
                          <button className="tbl-btn" style={{marginLeft:'auto'}}>Edit</button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{background:'white',border:'1px solid var(--border)',borderRadius:12,padding:'1.5rem'}}>
                    <p style={{fontSize:13,fontWeight:500,color:'var(--mid)',marginBottom:10,textTransform:'uppercase',letterSpacing:'0.06em'}}>Pickup Instructions <span style={{fontWeight:400,textTransform:'none',letterSpacing:0}}>(shown in confirmation only)</span></p>
                    <textarea className="form-input" rows={3} style={{height:'auto',resize:'none'}} defaultValue={bakeDays[0]?.pickup_instructions || ''} />
                    <button className="btn-primary" style={{marginTop:10}}>Save Instructions</button>
                  </div>
                </>
              )}

              {adminTab === 'products' && (
                <>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1.5rem'}}>
                    <h2 className="admin-section-title" style={{margin:0}}>Products</h2>
                    <button style={{background:'var(--sage)',color:'white',border:'none',borderRadius:10,padding:'10px 20px',fontSize:14,fontWeight:500,cursor:'pointer'}}>+ Add Product</button>
                  </div>
                  <div className="admin-table">
                    <div className="admin-table-head"><span className="col-wide">Product</span><span className="col-sm">Cat.</span><span className="col-sm">Price</span><span className="col-med">Variants</span><span className="col-act"></span></div>
                    {products.map(p => (
                      <div key={p.id} className="admin-table-row">
                        <span className="col-wide">{p.emoji} {p.name}</span>
                        <span className="col-sm">{p.category}</span>
                        <span className="col-sm">${p.price.toFixed(2)}</span>
                        <span className="col-med">{p.variants?.join(', ')||'—'}</span>
                        <span className="col-act"><button className="tbl-btn">Edit</button></span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {adminTab === 'settings' && (
                <>
                  <h2 className="admin-section-title">Settings</h2>
                  <div style={{background:'white',border:'1px solid var(--border)',borderRadius:12,padding:'1.5rem',maxWidth:480}}>
                    <div className="form-group"><label className="form-label">Bakery name</label><input className="form-input" defaultValue="Elizabeth & Co." /></div>
                    <div className="form-group"><label className="form-label">Pickup city (shown before ordering)</label><input className="form-input" defaultValue="Upper Yucaipa, CA" /></div>
                    <div className="form-group"><label className="form-label">Full pickup address (confirmation only)</label><input className="form-input" defaultValue="123 Willow Lane, Upper Yucaipa, CA 92399" /></div>
                    <div className="form-group"><label className="form-label">Zelle recipient</label><input className="form-input" defaultValue="elizabethandco@gmail.com" /></div>
                    <div className="form-group"><label className="form-label">Venmo handle</label><input className="form-input" defaultValue="@ElizabethandCo-Bread" /></div>
                    <div className="form-group"><label className="form-label">Tax rate (%)</label><input className="form-input" defaultValue="8.5" /></div>
                    <button className="btn-primary" style={{marginTop:8}}>Save settings</button>
                  </div>
                </>
              )}

            </div>
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════ CART DRAWER */}
      {cartOpen && (
        <>
          <div className="cart-overlay" onClick={() => setCartOpen(false)} />
          <div className="cart-drawer">
            <div className="cart-head">
              <span className="cart-head-title">Your Cart</span>
              <button className="close-btn" onClick={() => setCartOpen(false)}>✕</button>
            </div>
            <div className="cart-bake-info">Ordering for: <strong>{currentBakeDay?.label || '—'}</strong> · <span style={{color:'var(--sage)',cursor:'pointer'}} onClick={() => setCartOpen(false)}>Change</span></div>
            <div className="cart-items">
              {cart.length === 0 ? <p style={{textAlign:'center',color:'var(--mid)',fontSize:13,padding:'2rem 0'}}>Your cart is empty</p> : cart.map((item,i) => (
                <div key={i} className="cart-item">
                  <div className="cart-item-img">{item.emoji}</div>
                  <div style={{flex:1}}>
                    <div className="cart-item-name">{item.product_name}</div>
                    {item.variant && <div className="cart-item-sub">{item.variant}</div>}
                    <div className="qty-ctrl">
                      <button className="qty-btn" onClick={() => changeQty(item.product_id, item.variant, -1)}>−</button>
                      <span className="qty-num">{item.quantity}</span>
                      <button className="qty-btn" onClick={() => changeQty(item.product_id, item.variant, 1)}>+</button>
                    </div>
                  </div>
                  <div className="cart-item-price">${(item.unit_price*item.quantity).toFixed(2)}</div>
                </div>
              ))}
            </div>
            <div className="cart-footer">
              <div className="cart-line"><span>Subtotal</span><span>${sub.toFixed(2)}</span></div>
              <div className="cart-line"><span>Tax (8.5%)</span><span>${(sub*0.085).toFixed(2)}</span></div>
              <div className="cart-total-line"><span>Total</span><span>${(sub*1.085).toFixed(2)}</span></div>
              <button className="checkout-btn" onClick={() => { setCartOpen(false); setView('checkout'); }}>Proceed to Checkout</button>
            </div>
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════ SMS MODAL */}
      {smsModalOpen && (
        <div className="modal-bg">
          <div className="modal">
            <button className="modal-close" onClick={() => setSmsModalOpen(false)}>✕</button>
            <p className="modal-title">Stay in the loop 🍞</p>
            <p className="modal-sub">Sign up for texts and never miss a bread drop or pickup reminder.</p>
            <div className="form-group"><label className="form-label">Your phone number</label><input className="form-input" type="tel" placeholder="(909) 555-0000" /></div>
            <div style={{margin:'1rem 0 1.5rem'}}>
              {[{label:'New bake day announcements',sub:'When new drops open for ordering'},{label:'Order closing reminders',sub:'Before the cutoff deadline'},{label:'Pickup & delivery reminders',sub:'Day-of text with full address'},{label:'Order ready notifications',sub:'Text when your order is packed'},{label:'Promos & specials',sub:'Seasonal drops and deals'}].map((opt,i) => (
                <div key={i} className="sms-opt">
                  <div className="sms-check checked">✓</div>
                  <div style={{flex:1,fontSize:14}}>
                    <div>{opt.label}</div>
                    <div style={{fontSize:12,color:'var(--mid)',fontWeight:300}}>{opt.sub}</div>
                  </div>
                </div>
              ))}
            </div>
            <button className="btn-large btn-large-primary" style={{width:'100%'}} onClick={() => setSmsModalOpen(false)}>Sign me up</button>
            <p style={{fontSize:11,color:'var(--mid)',textAlign:'center',marginTop:10}}>Reply STOP anytime to unsubscribe.</p>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════ REQUEST MODAL */}
      {requestModalOpen && (
        <div className="modal-bg">
          <div className="modal">
            <button className="modal-close" onClick={() => setRequestModalOpen(false)}>✕</button>
            <p className="modal-title">Submit a Request ✉️</p>
            <p className="modal-sub">Need a custom bake date or bulk order? Brynlee will reach out to discuss.</p>
            <div className="request-disclaimer"><strong>Note:</strong> Inquiry only — not a confirmed order. Brynlee will contact you within 1–2 business days.</div>
            <div style={{marginBottom:'1.25rem'}}>
              <div className="form-label" style={{marginBottom:8}}>Type of request</div>
              <div className="req-type-opts">
                <div className={`req-type-opt ${reqType==='custom_date'?'active':''}`} onClick={() => setReqType('custom_date')}><span className="req-type-icon">📅</span>Custom Date</div>
                <div className={`req-type-opt ${reqType==='bulk_order'?'active':''}`} onClick={() => setReqType('bulk_order')}><span className="req-type-icon">📦</span>Bulk Order</div>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">First name</label><input className="form-input" value={requestForm.firstName} onChange={e => setRequestForm(f=>({...f,firstName:e.target.value}))} /></div>
              <div className="form-group"><label className="form-label">Last name</label><input className="form-input" value={requestForm.lastName} onChange={e => setRequestForm(f=>({...f,lastName:e.target.value}))} /></div>
            </div>
            <div className="form-group"><label className="form-label">Email</label><input className="form-input" type="email" value={requestForm.email} onChange={e => setRequestForm(f=>({...f,email:e.target.value}))} /></div>
            <div className="form-group"><label className="form-label">Phone</label><input className="form-input" value={requestForm.phone} onChange={e => setRequestForm(f=>({...f,phone:e.target.value}))} /></div>
            <div className="form-group"><label className="form-label">Requested date(s)</label><input className="form-input" value={requestForm.requestedDates} onChange={e => setRequestForm(f=>({...f,requestedDates:e.target.value}))} placeholder="e.g. Saturday May 10, or any Friday in June" /></div>
            <div className="form-group"><label className="form-label">What you'd like to order</label><textarea className="form-input" rows={3} style={{height:'auto',resize:'none'}} value={requestForm.itemsRequested} onChange={e => setRequestForm(f=>({...f,itemsRequested:e.target.value}))} placeholder="e.g. 6× Plain Sourdough, 2× Jalapeño Cheddar..." /></div>
            <div className="form-group"><label className="form-label">Anything else?</label><textarea className="form-input" rows={2} style={{height:'auto',resize:'none'}} value={requestForm.notes} onChange={e => setRequestForm(f=>({...f,notes:e.target.value}))} placeholder="Special occasion, decorated boxes, dietary notes..." /></div>
            <button className="btn-large btn-large-primary" style={{width:'100%',marginTop:4}} onClick={async () => {
              await supabase.from('custom_requests').insert({...requestForm, request_type: reqType})
              setRequestModalOpen(false)
              alert('Your inquiry has been sent to Brynlee! She\'ll reach out within 1–2 business days. 🍞')
            }}>Send Inquiry to Brynlee</button>
          </div>
        </div>
      )}
    </>
  )
}
