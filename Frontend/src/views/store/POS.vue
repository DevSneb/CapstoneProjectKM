<template>
  <div class="pos-page" :class="{ 'owner-mode': isStoreOwnerPosView }">
    <header class="pos-topbar">
      <div class="brand-block">
        <span class="brand-mark">POS</span>
        <div>
          <strong>{{ user.store_name || 'Store' }}</strong>
          <small>{{ isStoreOwnerPosView ? 'Users & sales desk' : 'Point of sale terminal' }}</small>
        </div>
      </div>

      <nav class="pos-tabs" aria-label="POS sections">
        <button
          v-for="item in visibleMenuItems"
          :key="item.key"
          type="button"
          class="pos-tab"
          :class="{ active: activePosSection === item.key }"
          @click="activePosSection = item.key"
        >
          {{ item.label }}
        </button>
      </nav>

      <div class="topbar-actions">
        <time class="clock" :datetime="nowIso">{{ clockLabel }}</time>
        <button v-if="showCheckoutSection" type="button" class="ghost-btn" @click="fetchProducts">Refresh</button>
        <button v-if="showCheckoutSection" type="button" class="ghost-btn danger-text" @click="clearSale" :disabled="!cart.length">Void</button>
      </div>
    </header>

    <!-- LIVE CHECKOUT / INVENTORY -->
    <div v-if="showCheckoutSection && ['checkout', 'inventory'].includes(activePosSection)" class="pos-workbench">
      <section class="catalog">
        <div class="catalog-toolbar">
          <input
            v-model="q"
            class="search-input"
            @input="debouncedFetch"
            placeholder="Scan barcode or search SKU…"
            aria-label="Search products"
          />
          <div class="category-strip" role="tablist" aria-label="Categories">
            <button type="button" class="chip" :class="{ active: selectedCategory === 'All' }" @click="selectedCategory = 'All'">All</button>
            <button
              v-for="category in categories"
              :key="category"
              type="button"
              class="chip"
              :class="{ active: selectedCategory === category }"
              @click="selectedCategory = category"
            >
              {{ category }}
            </button>
          </div>
        </div>

        <div class="product-grid">
          <button
            v-for="p in filteredProducts"
            :key="p.id"
            type="button"
            class="sku-tile"
            :disabled="Number(p.stock) <= 0 || activePosSection !== 'checkout'"
            @click="activePosSection === 'checkout' && quickAdd(p)"
          >
            <span class="sku-thumb">
              <img v-if="productImageUrl(p)" :src="productImageUrl(p)" :alt="p.name" />
              <span v-else>{{ String(p.name || 'P').slice(0, 1).toUpperCase() }}</span>
            </span>
            <span class="sku-details">
              <small>{{ p.category || 'General' }}</small>
              <strong class="sku-name">{{ p.name }}</strong>
              <span class="sku-meta">
                <span class="sku-price">₱{{ Number(p.price).toFixed(2) }}</span>
                <span class="sku-stock" :class="{ low: Number(p.stock || 0) <= 10, out: Number(p.stock || 0) <= 0 }">
                  {{ Number(p.stock || 0) <= 0 ? 'Out' : `${p.stock} left` }}
                </span>
              </span>
            </span>
          </button>
          <div v-if="filteredProducts.length === 0" class="empty-state">No products found.</div>
        </div>
      </section>

      <aside v-if="activePosSection === 'checkout'" class="ticket" :class="{ 'mobile-open': mobileCartOpen }">
        <div class="display-strip" aria-live="polite">
          <span>DUE</span>
          <strong>₱{{ grandTotal.toFixed(2) }}</strong>
        </div>

        <div class="ticket-head">
          <div>
            <h3>Ticket</h3>
            <p>{{ cart.length }} item{{ cart.length === 1 ? '' : 's' }} · ₱{{ subtotal.toFixed(2) }}</p>
          </div>
          <div class="ticket-head-actions">
            <button type="button" class="ghost-btn danger-text" :disabled="!cart.length" @click="clearSale">Clear</button>
            <button type="button" class="mobile-close-btn" aria-label="Close order" @click="mobileCartOpen = false">×</button>
          </div>
        </div>

        <div class="ticket-lines">
          <div v-for="line in cart" :key="line.product_id" class="ticket-line">
            <span class="line-thumb">
              <img v-if="line.image_url" :src="line.image_url" :alt="line.name" />
              <span v-else>{{ String(line.name || 'P').slice(0, 1).toUpperCase() }}</span>
            </span>
            <div class="line-main">
              <strong>{{ line.name }}</strong>
              <span>@ ₱{{ Number(line.unit_price).toFixed(2) }}</span>
            </div>
            <div class="line-controls">
              <button type="button" class="qty-btn" @click="bumpQty(line, -1)">−</button>
              <input type="number" min="0.001" step="0.001" :max="Math.max(0.001, Number(line.stock || 0))" v-model.number="line.quantity" @change="normalizeCartLine(line)" />
              <button type="button" class="qty-btn" @click="bumpQty(line, 1)">+</button>
              <button type="button" class="remove-btn" @click="removeLine(line.product_id)" aria-label="Remove">×</button>
              <span class="line-total">₱{{ lineSubtotal(line).toFixed(2) }}</span>
            </div>
          </div>
          <div v-if="!cart.length" class="ticket-empty">Tap a product to ring it up</div>
        </div>

        <div class="ticket-pay">
          <div class="pay-toggles">
            <button type="button" class="pay-mode" :class="{ active: paymentMethod === 'cash' }" @click="paymentMethod = 'cash'; normalizeCheckoutInputs()">Cash</button>
            <button
              type="button"
              class="pay-mode soon"
              disabled
              title="GCash available soon"
            >
              GCash <span class="soon-tag">Soon</span>
            </button>
          </div>

          <div class="pay-fields">
            <label>
              Discount ₱
              <input type="number" min="0" step="0.01" v-model.number="discountAmount" @change="normalizeCheckoutInputs" />
            </label>
            <label v-if="paymentMethod === 'cash'">
              Cash tendered
              <input type="number" min="0" step="0.01" v-model.number="cashReceived" @change="normalizeCheckoutInputs" />
            </label>
            <label class="full">
              Note
              <input v-model="notes" maxlength="200" placeholder="Optional" />
            </label>
          </div>

          <div v-if="paymentMethod === 'cash'" class="tender-pad" aria-label="Quick cash amounts">
            <button type="button" class="tender-btn" :disabled="!cart.length" @click="setExactCash">Exact</button>
            <button
              v-for="amt in quickCashAmounts"
              :key="amt"
              type="button"
              class="tender-btn"
              :disabled="!cart.length"
              @click="addCashTender(amt)"
            >
              +{{ amt }}
            </button>
          </div>

          <div class="totals-block">
            <div><span>Subtotal</span><strong>₱{{ subtotal.toFixed(2) }}</strong></div>
            <div><span>Discount</span><strong>−₱{{ appliedDiscount.toFixed(2) }}</strong></div>
            <div class="grand"><span>TOTAL</span><strong>₱{{ grandTotal.toFixed(2) }}</strong></div>
            <div v-if="paymentMethod === 'cash'" class="change"><span>Change</span><strong>₱{{ changeAmount.toFixed(2) }}</strong></div>
          </div>

          <button
            type="button"
            class="charge-btn"
            :disabled="submitting || !canCheckout"
            @click="checkout"
          >
            {{ submitting ? 'Processing…' : (paymentMethod === 'cash' ? `CHARGE ₱${grandTotal.toFixed(2)}` : `GCASH ₱${grandTotal.toFixed(2)}`) }}
          </button>

          <div v-if="message" class="notice" :class="messageType">{{ message }}</div>
        </div>
      </aside>

      <aside v-else class="ticket inventory-note">
        <h3>Stock browser</h3>
        <p>Review inventory by category. Switch to <strong>Sell</strong> to ring up a sale.</p>
        <button type="button" class="charge-btn secondary" @click="activePosSection = 'checkout'">Go to Sell</button>
      </aside>
    </div>

    <template v-if="showCheckoutSection && activePosSection === 'checkout'">
      <button
        type="button"
        class="mobile-cart-bar"
        :disabled="!cart.length"
        @click="mobileCartOpen = true"
      >
        <span class="mobile-cart-count">{{ cart.reduce((sum, line) => sum + Number(line.quantity || 0), 0) }}</span>
        <span>
          <small>{{ cart.length ? 'Review order' : 'Select a product' }}</small>
          <strong>₱{{ grandTotal.toFixed(2) }}</strong>
        </span>
        <b>{{ cart.length ? 'View cart →' : 'Cart' }}</b>
      </button>
      <div v-if="mobileCartOpen" class="mobile-ticket-backdrop" @click="mobileCartOpen = false"></div>
    </template>

    <!-- OWNER / HISTORY -->
    <div v-if="showPosAdminSection || ['sales', 'reports'].includes(activePosSection)" class="admin-grid">
      <section v-if="showPosUserManagement && activePosSection !== 'sales'" class="panel">
        <div class="panel-head">
          <div>
            <h3>POS Users</h3>
            <p>Register cashier accounts for this store.</p>
          </div>
        </div>

        <form class="pos-users-form" @submit.prevent="createPosUser">
          <input v-model.trim="posForm.email" type="email" placeholder="Email" required />
          <input v-model="posForm.password" type="password" placeholder="Password (min 6)" required minlength="6" />
          <button type="submit" class="primary-btn" :disabled="posUsersSubmitting">{{ posUsersSubmitting ? 'Adding…' : 'Add user' }}</button>
          <p class="pos-users-hint">Cashiers sign in at <strong>/pos/login</strong> with this email + password.</p>
        </form>

        <div v-if="message && isStoreOwnerPosView" class="notice" :class="messageType">{{ message }}</div>

        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr><th>Email</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              <tr v-for="u in posUsers" :key="u.id">
                <td data-label="Email">{{ u.email || u.username }}</td>
                <td data-label="Status">{{ u.status }}</td>
                <td data-label="Actions">
                  <button type="button" class="ghost-btn" @click="togglePosUserStatus(u)">{{ u.status === 'approved' ? 'Disable' : 'Enable' }}</button>
                  <button type="button" class="ghost-btn" @click="resetPosUserPassword(u)">Reset password</button>
                  <button type="button" class="ghost-btn danger-text" @click="deletePosUser(u)">Delete</button>
                </td>
              </tr>
              <tr v-if="!posUsers.length"><td colspan="3" class="empty">No POS users yet.</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="['sales', 'reports'].includes(activePosSection) || isStoreOwnerPosView" class="panel">
        <div class="panel-head">
          <div>
            <h3>{{ activePosSection === 'reports' ? 'POS Reports' : 'Sales History' }}</h3>
            <p>Recent register transactions.</p>
          </div>
          <button type="button" class="ghost-btn" @click="fetchRecentSales">Refresh</button>
        </div>

        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr><th>Order</th><th>Date</th><th>Payment</th><th>Total</th><th></th></tr>
            </thead>
            <tbody>
              <tr v-for="sale in recentSales" :key="sale.id">
                <td data-label="Order">#{{ sale.id }}</td>
                <td data-label="Date">{{ new Date(sale.created_at).toLocaleString() }}</td>
                <td data-label="Payment">{{ sale.payment_method === 'cod' || sale.payment_method === 'cash' ? 'Cash' : 'GCash' }}</td>
                <td data-label="Total">₱{{ Number(sale.total_amount || 0).toFixed(2) }}</td>
                <td data-label=""><button type="button" class="ghost-btn" @click="openSaleDetails(sale.id)">View</button></td>
              </tr>
              <tr v-if="!recentSales.length"><td colspan="5" class="empty">No POS sales found.</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <div v-if="showSaleDetails">
      <div class="modal-backdrop" @click="closeSaleDetails"></div>
      <div class="modal receipt-modal" role="dialog" aria-label="Sale details">
        <h3>Sale receipt</h3>
        <div v-if="loadingSaleDetails" class="empty">Loading…</div>
        <div v-else-if="selectedSale">
          <p class="meta">
            Order #{{ selectedSale.id }} ·
            {{ new Date(selectedSale.created_at).toLocaleString() }} ·
            {{ selectedSale.payment_method === 'cod' || selectedSale.payment_method === 'cash' ? 'Cash' : 'GCash' }}
          </p>
          <table class="table">
            <thead><tr><th>Product</th><th>Qty</th><th>Unit</th><th>Subtotal</th></tr></thead>
            <tbody>
              <tr v-for="item in selectedSaleItems" :key="item.id">
                <td>{{ item.product_name || ('Product #' + item.product_id) }}</td>
                <td>{{ Number(item.quantity || 0) }}</td>
                <td>₱{{ Number(item.unit_price || 0).toFixed(2) }}</td>
                <td>₱{{ Number(item.subtotal || 0).toFixed(2) }}</td>
              </tr>
              <tr v-if="!selectedSaleItems.length"><td colspan="4" class="empty">No items.</td></tr>
            </tbody>
          </table>
          <div class="totals-block compact">
            <div v-if="Number(selectedSale.discount_amount || 0)"><span>Discount</span><strong>−₱{{ Number(selectedSale.discount_amount || 0).toFixed(2) }}</strong></div>
            <div class="grand"><span>Total</span><strong>₱{{ Number(selectedSale.total_amount || 0).toFixed(2) }}</strong></div>
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="ghost-btn" @click="closeSaleDetails">Close</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import api from '../../services/api'
import { readAuth } from '../../services/authStorage'
const API_ROOT = (api.defaults.baseURL || '').replace(/\/api\/?$/, '')

function debounce(fn, delay = 350) {
  let timer
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}

export default {
  name: 'StorePOS',
  data() {
    return {
      q: '',
      products: [],
      qtyByProduct: {},
      cart: [],
      paymentMethod: 'cash',
      discountAmount: 0,
      cashReceived: 0,
      notes: '',
      message: '',
      messageType: 'ok',
      submitting: false,
      recentSales: [],
      lastReceipt: null,
      showSaleDetails: false,
      loadingSaleDetails: false,
      selectedSale: null,
      selectedSaleItems: [],
      posUsers: [],
      posForm: { email: '', password: '' },
      posUsersSubmitting: false,
      selectedCategory: 'All',
      activePosSection: 'checkout',
      now: Date.now(),
      clockTimer: null,
      quickCashAmounts: [20, 50, 100, 200, 500, 1000],
      mobileCartOpen: false
    }
  },
  computed: {
    posMenuItems() {
      if (this.isStoreOwnerPosView) {
        return [
          { key: 'reports', label: 'Users & Sales' },
          { key: 'sales', label: 'History' }
        ]
      }
      return [
        { key: 'checkout', label: 'Sell' },
        { key: 'inventory', label: 'Stock' },
        { key: 'sales', label: 'History' },
        { key: 'reports', label: 'Reports' }
      ]
    },
    visibleMenuItems() {
      return this.posMenuItems
    },
    user() {
      if (this.$route.path.startsWith('/pos/')) return readAuth('pos_user').user || {}
      return readAuth('store_owner').user || {}
    },
    userRole() {
      if (this.$route.path.startsWith('/pos/')) return readAuth('pos_user').userRole || 'pos_user'
      return readAuth('store_owner').userRole || 'store_owner'
    },
    isStoreOwnerPosView() {
      return this.userRole === 'store_owner' && this.$route.path.includes('/store-owner/dashboard')
    },
    showCheckoutSection() {
      return !this.isStoreOwnerPosView
    },
    showPosAdminSection() {
      return this.isStoreOwnerPosView
    },
    basePosPath() {
      return this.userRole === 'store_owner' ? '/store/pos' : '/pos'
    },
    subtotal() {
      return this.cart.reduce((sum, line) => sum + this.lineSubtotal(line), 0)
    },
    appliedDiscount() {
      return Math.min(Math.max(0, Number(this.discountAmount || 0)), this.subtotal)
    },
    grandTotal() {
      return Number((this.subtotal - this.appliedDiscount).toFixed(2))
    },
    changeAmount() {
      if (this.paymentMethod !== 'cash') return 0
      return Math.max(0, Number((Number(this.cashReceived || 0) - this.grandTotal).toFixed(2)))
    },
    hasEnoughCash() {
      if (this.paymentMethod !== 'cash') return true
      return Number(this.cashReceived || 0) >= this.grandTotal
    },
    canCheckout() {
      return this.cart.length > 0 && this.hasEnoughCash
    },
    canManagePosUsers() {
      return this.userRole === 'store_owner'
    },
    showPosUserManagement() {
      return this.canManagePosUsers && this.isStoreOwnerPosView
    },
    categories() {
      const cats = new Set()
      for (const p of this.products) cats.add(p.category || 'Uncategorized')
      return [...cats]
    },
    filteredProducts() {
      const query = (this.q || '').toLowerCase().trim()
      return this.products.filter((p) => {
        const matchesQuery = !query || p.name.toLowerCase().includes(query) || (p.description || '').toLowerCase().includes(query)
        const category = p.category || 'Uncategorized'
        const matchesCategory = this.selectedCategory === 'All' || category === this.selectedCategory
        return matchesQuery && matchesCategory
      })
    },
    nowIso() {
      return new Date(this.now).toISOString()
    },
    clockLabel() {
      return new Date(this.now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    }
  },
  created() {
    this.debouncedFetch = debounce(this.fetchProducts, 300)
    if (this.isStoreOwnerPosView) this.activePosSection = 'reports'
    if (this.showCheckoutSection) this.fetchProducts()
    this.fetchRecentSales()
    if (this.showPosUserManagement) this.fetchPosUsers()
    this.clockTimer = setInterval(() => {
      this.now = Date.now()
    }, 1000)
  },
  beforeUnmount() {
    if (this.clockTimer) clearInterval(this.clockTimer)
  },
  methods: {
    quickAdd(product) {
      this.qtyByProduct[product.id] = 1
      this.addToCart(product)
    },
    productImageUrl(product) {
      const value = String(product?.image_url || '').trim()
      if (!value) return ''
      if (/^https?:\/\//i.test(value) || value.startsWith('data:')) return value
      return `${API_ROOT}${value.startsWith('/') ? '' : '/'}${value}`
    },
    bumpQty(line, delta) {
      line.quantity = Math.max(1, Number(line.quantity || 1) + delta)
      this.normalizeCartLine(line)
    },
    setExactCash() {
      this.cashReceived = Number(this.grandTotal.toFixed(2))
      this.normalizeCheckoutInputs()
    },
    addCashTender(amount) {
      this.cashReceived = Number((Number(this.cashReceived || 0) + Number(amount || 0)).toFixed(2))
      this.normalizeCheckoutInputs()
    },
    normalizeCheckoutInputs() {
      this.discountAmount = Math.max(0, Number(this.discountAmount || 0))
      this.cashReceived = Math.max(0, Number(this.cashReceived || 0))
      if (this.paymentMethod !== 'cash') this.cashReceived = 0
    },
    lineSubtotal(line) {
      return Number(line.unit_price || 0) * Number(line.quantity || 0)
    },
    async fetchProducts() {
      if (!this.showCheckoutSection) return
      try {
        const { data } = await api.get(this.basePosPath + '/products', { params: { q: this.q || undefined } })
        this.products = data || []
        for (const p of this.products) {
          if (!this.qtyByProduct[p.id]) this.qtyByProduct[p.id] = 1
        }
      } catch (err) {
        this.messageType = 'error'
        this.message = err?.response?.data?.message || 'Failed to load products'
      }
    },
    async fetchRecentSales() {
      try {
        const { data } = await api.get(this.basePosPath + '/sales', { params: { limit: 15 } })
        this.recentSales = Array.isArray(data) ? data : []
      } catch (err) {
        this.recentSales = []
      }
    },
    addToCart(product) {
      if (Number(product.stock || 0) <= 0) {
        this.messageType = 'error'
        this.message = `${product.name} is out of stock`
        return
      }
      const qty = Math.max(1, Number(this.qtyByProduct[product.id] || 1))
      if (qty > Number(product.stock || 0)) {
        this.messageType = 'error'
        this.message = `Only ${product.stock} stock available for ${product.name}`
        return
      }
      const existing = this.cart.find((x) => x.product_id === product.id)
      if (existing) {
        existing.quantity = Math.min(Number(product.stock || 0), Number(existing.quantity) + qty)
      } else {
        this.cart.push({
          product_id: product.id,
          name: product.name,
          unit_price: Number(product.price),
          quantity: qty,
          stock: Number(product.stock || 0),
          image_url: this.productImageUrl(product)
        })
      }
      this.message = ''
    },
    normalizeCartLine(line) {
      line.quantity = Math.max(0.001, Number(line.quantity || 0.001))
      if (Number(line.stock || 0) <= 0) {
        line.quantity = 0.001
        this.messageType = 'error'
        this.message = `${line.name} is now out of stock. Remove it from sale.`
        return
      }
      if (line.quantity > line.stock) line.quantity = line.stock
    },
    removeLine(productId) {
      this.cart = this.cart.filter((x) => x.product_id !== productId)
    },
    clearSale() {
      this.cart = []
      this.discountAmount = 0
      this.cashReceived = 0
      this.notes = ''
      this.mobileCartOpen = false
    },
    async fetchPosUsers() {
      try {
        const { data } = await api.get('/store/pos/users')
        this.posUsers = data || []
      } catch (err) {
        this.posUsers = []
      }
    },
    async createPosUser() {
      if (!this.canManagePosUsers) return
      this.posUsersSubmitting = true
      try {
        const email = String(this.posForm.email || '').trim().toLowerCase()
        await api.post('/store/pos/users', {
          email,
          password: this.posForm.password
        })
        this.posForm = { email: '', password: '' }
        await this.fetchPosUsers()
        this.messageType = 'success'
        this.message = `POS user "${email}" created. Sign in at /pos/login with email + password.`
      } catch (err) {
        this.messageType = 'error'
        this.message = err?.response?.data?.message || 'Failed to create POS user'
      } finally {
        this.posUsersSubmitting = false
      }
    },
    async resetPosUserPassword(user) {
      if (!this.canManagePosUsers) return
      const label = user.email || user.username
      const next = window.prompt(`New password for ${label} (min 6 characters):`)
      if (next == null) return
      const password = String(next)
      if (password.length < 6) {
        this.messageType = 'error'
        this.message = 'Password must be at least 6 characters'
        return
      }
      try {
        await api.put(`/store/pos/users/${user.id}/password`, { password })
        this.messageType = 'success'
        this.message = `Password updated for ${label}. They can sign in at /pos/login.`
      } catch (err) {
        this.messageType = 'error'
        this.message = err?.response?.data?.message || 'Failed to reset POS password'
      }
    },
    async togglePosUserStatus(user) {
      if (!this.canManagePosUsers) return
      const next = user.status === 'approved' ? 'disabled' : 'approved'
      try {
        await api.put(`/store/pos/users/${user.id}/status`, { status: next })
        await this.fetchPosUsers()
      } catch (err) {
        this.messageType = 'error'
        this.message = err?.response?.data?.message || 'Failed to update POS user status'
      }
    },
    async deletePosUser(user) {
      if (!this.canManagePosUsers) return
      const label = user.email || user.username
      if (!confirm(`Delete POS user ${label}? This cannot be undone.`)) return
      try {
        await api.delete(`/store/pos/users/${user.id}`)
        await this.fetchPosUsers()
        this.messageType = 'ok'
        this.message = 'POS user deleted successfully.'
      } catch (err) {
        this.messageType = 'error'
        this.message = err?.response?.data?.message || 'Failed to delete POS user'
      }
    },
    async checkout() {
      if (!this.showCheckoutSection) return
      this.normalizeCheckoutInputs()
      if (!this.canCheckout) return
      this.submitting = true
      this.message = ''
      try {
        const payload = {
          payment_method: this.paymentMethod,
          discount_amount: Number(this.appliedDiscount || 0),
          cash_received: this.paymentMethod === 'cash' ? Number(this.cashReceived || 0) : 0,
          notes: this.notes || null,
          items: this.cart.map((line) => ({
            product_id: line.product_id,
            quantity: Number(line.quantity)
          }))
        }
        const { data } = await api.post(this.basePosPath + '/checkout', payload)
        this.lastReceipt = data
        const change = this.paymentMethod === 'cash' ? this.changeAmount : 0
        this.messageType = 'ok'
        this.message = change > 0
          ? `Sale #${data?.order?.id || ''} complete · Change ₱${change.toFixed(2)}`
          : `Sale #${data?.order?.id || ''} complete`
        this.clearSale()
        await Promise.all([this.fetchProducts(), this.fetchRecentSales()])
      } catch (err) {
        this.messageType = 'error'
        this.message = err?.response?.data?.message || err?.response?.data?.errors?.[0]?.msg || 'Checkout failed'
      } finally {
        this.submitting = false
      }
    },
    async openSaleDetails(saleId) {
      this.showSaleDetails = true
      this.loadingSaleDetails = true
      this.selectedSale = null
      this.selectedSaleItems = []
      try {
        const { data } = await api.get(`${this.basePosPath}/sales/${saleId}`)
        this.selectedSale = data?.order || data || null
        this.selectedSaleItems = data?.items || []
      } catch (err) {
        this.messageType = 'error'
        this.message = err?.response?.data?.message || 'Failed to load sale details'
        this.showSaleDetails = false
      } finally {
        this.loadingSaleDetails = false
      }
    },
    closeSaleDetails() {
      this.showSaleDetails = false
      this.selectedSale = null
      this.selectedSaleItems = []
    }
  }
}
</script>

<style scoped>
.pos-page {
  --pos-ink: #f3f6ef;
  --pos-muted: #93a190;
  --pos-panel: #161d13;
  --pos-panel-2: #0f140c;
  --pos-line: rgba(255, 255, 255, 0.09);
  --pos-accent: #7cb342;
  --pos-accent-deep: #4e7d32;
  --pos-warn: #e0a106;
  --pos-danger: #e05a4a;
  --pos-mono: "IBM Plex Mono", "Consolas", "Courier New", monospace;
  color: var(--pos-ink);
  display: grid;
  gap: 10px;
  min-height: 70vh;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow-x: hidden;
  font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
}

.pos-topbar {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 10px;
  align-items: center;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--pos-panel);
  border: 1px solid var(--pos-line);
  min-width: 0;
}

.brand-block {
  display: flex;
  align-items: center;
  gap: 10px;
}
.brand-mark {
  width: 40px;
  height: 40px;
  border-radius: 6px;
  display: grid;
  place-items: center;
  font-weight: 800;
  letter-spacing: 0.04em;
  font-size: 0.78rem;
  background: linear-gradient(180deg, var(--pos-accent), var(--pos-accent-deep));
  color: #0d1609;
}
.brand-block strong {
  display: block;
  font-size: 0.98rem;
}
.brand-block small {
  color: var(--pos-muted);
  font-size: 0.74rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.pos-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: center;
  min-width: 0;
}
.pos-tab {
  min-height: 38px;
  padding: 0 12px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--pos-muted);
  font-weight: 700;
  font-size: 0.86rem;
  cursor: pointer;
}
.pos-tab.active {
  background: rgba(124, 179, 66, 0.16);
  border-color: rgba(124, 179, 66, 0.4);
  color: #e4f5cc;
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.clock {
  font-family: var(--pos-mono);
  font-size: 0.82rem;
  color: #b7c9ad;
  min-width: 78px;
  text-align: right;
}

.pos-workbench {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(300px, 400px);
  gap: 10px;
  height: calc(100dvh - 150px);
  min-height: 520px;
  width: 100%;
  min-width: 0;
  align-items: stretch;
}

.catalog,
.ticket,
.panel {
  background: var(--pos-panel);
  border: 1px solid var(--pos-line);
  border-radius: 8px;
  min-width: 0;
}

.catalog {
  display: grid;
  grid-template-rows: auto 1fr;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.catalog-toolbar {
  padding: 10px;
  border-bottom: 1px solid var(--pos-line);
  display: grid;
  gap: 8px;
  background: #12180f;
}

.search-input {
  width: 100%;
  min-height: 46px;
  border-radius: 6px;
  border: 1px solid var(--pos-line);
  background: var(--pos-panel-2);
  color: var(--pos-ink);
  padding: 0 12px;
  font-size: 16px;
}

.category-strip {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 2px;
  -webkit-overflow-scrolling: touch;
}
.chip {
  flex: 0 0 auto;
  min-height: 34px;
  padding: 0 11px;
  border-radius: 4px;
  border: 1px solid var(--pos-line);
  background: transparent;
  color: var(--pos-muted);
  font-weight: 700;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  cursor: pointer;
  white-space: nowrap;
}
.chip.active {
  background: var(--pos-accent);
  border-color: transparent;
  color: #0d1609;
}

.product-grid {
  padding: 10px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
  gap: 8px;
  align-content: start;
  overflow: auto;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.015), transparent 40%),
    var(--pos-panel);
}

.sku-tile {
  min-height: 112px;
  border-radius: 6px;
  border: 1px solid var(--pos-line);
  background: #1b2417;
  color: inherit;
  text-align: left;
  padding: 10px;
  display: grid;
  gap: 6px;
  align-content: space-between;
  cursor: pointer;
  transition: border-color 0.12s ease, background 0.12s ease;
}
.sku-tile:hover:not(:disabled) {
  border-color: rgba(124, 179, 66, 0.65);
  background: #22301c;
}
.sku-tile:active:not(:disabled) {
  background: #2a3a22;
}
.sku-tile:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.sku-price {
  font-family: var(--pos-mono);
  font-size: 1.12rem;
  font-weight: 700;
  color: #c8e6a0;
}
.sku-name {
  font-size: 0.88rem;
  line-height: 1.25;
  font-weight: 700;
}
.sku-stock {
  font-family: var(--pos-mono);
  font-size: 0.7rem;
  color: var(--pos-muted);
  letter-spacing: 0.02em;
}
.sku-stock.low { color: var(--pos-warn); }
.sku-stock.out { color: var(--pos-danger); }

.ticket {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  min-height: 0;
  height: 100%;
  max-height: none;
  overflow: hidden;
}
.display-strip {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 10px;
  padding: 12px 14px;
  background: #0a1208;
  border-bottom: 1px solid rgba(124, 179, 66, 0.35);
  font-family: var(--pos-mono);
}
.display-strip span {
  color: #8fad78;
  font-size: 0.78rem;
  letter-spacing: 0.12em;
}
.display-strip strong {
  font-size: 1.7rem;
  color: #e8ffc8;
  letter-spacing: 0.02em;
}

.ticket-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--pos-line);
}
.ticket-head h3 {
  margin: 0;
  font-size: 0.95rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.ticket-head p {
  margin: 2px 0 0;
  color: var(--pos-muted);
  font-size: 0.78rem;
  font-family: var(--pos-mono);
}

.ticket-lines {
  min-height: 0;
  overflow: auto;
  padding: 8px 10px;
  display: grid;
  gap: 6px;
  align-content: start;
  background: #12180f;
}
.ticket-line {
  display: grid;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 4px;
  background: var(--pos-panel-2);
  border: 1px solid var(--pos-line);
}
.line-main {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 0.86rem;
}
.line-main span {
  color: var(--pos-muted);
  font-family: var(--pos-mono);
  font-size: 0.78rem;
  white-space: nowrap;
}
.line-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}
.line-controls input {
  width: 52px;
  min-height: 34px;
  text-align: center;
  border-radius: 4px;
  border: 1px solid var(--pos-line);
  background: #0a1008;
  color: var(--pos-ink);
  font-family: var(--pos-mono);
}
.qty-btn,
.remove-btn {
  width: 34px;
  height: 34px;
  border-radius: 4px;
  border: 1px solid var(--pos-line);
  background: #24301f;
  color: var(--pos-ink);
  cursor: pointer;
  font-size: 1.05rem;
  font-weight: 700;
}
.remove-btn { color: var(--pos-danger); }
.line-total {
  margin-left: auto;
  font-family: var(--pos-mono);
  font-weight: 700;
  color: #d7efc3;
  font-size: 0.9rem;
}
.ticket-empty {
  padding: 40px 12px;
  text-align: center;
  color: var(--pos-muted);
  font-size: 0.9rem;
}

.ticket-pay {
  border-top: 1px solid var(--pos-line);
  padding: 10px;
  display: grid;
  gap: 8px;
  background: #10170e;
  min-height: 0;
  overflow-y: auto;
  max-height: 42%;
}
.pay-toggles {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.pay-mode {
  min-height: 44px;
  border-radius: 6px;
  border: 1px solid var(--pos-line);
  background: transparent;
  color: var(--pos-muted);
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  cursor: pointer;
}
.pay-mode.active {
  background: rgba(124, 179, 66, 0.18);
  border-color: rgba(124, 179, 66, 0.55);
  color: #e8f7d4;
}
.pay-mode.soon {
  opacity: 0.55;
  cursor: not-allowed;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.pay-mode .soon-tag {
  font-size: 0.62rem;
  letter-spacing: 0.02em;
  padding: 2px 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  color: #c9d6e8;
  text-transform: none;
  font-weight: 700;
}
.pay-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.pay-fields label {
  display: grid;
  gap: 4px;
  font-size: 0.72rem;
  color: var(--pos-muted);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.pay-fields label.full { grid-column: 1 / -1; }
.pay-fields input {
  min-height: 42px;
  border-radius: 4px;
  border: 1px solid var(--pos-line);
  background: #0a1008;
  color: var(--pos-ink);
  padding: 0 10px;
  font-size: 16px;
  font-family: var(--pos-mono);
}

.tender-pad {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}
.tender-btn {
  min-height: 40px;
  border-radius: 4px;
  border: 1px solid var(--pos-line);
  background: #1c2718;
  color: #d7e8cb;
  font-family: var(--pos-mono);
  font-weight: 700;
  font-size: 0.82rem;
  cursor: pointer;
}
.tender-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.tender-btn:not(:disabled):active {
  background: #2a3923;
}

.totals-block {
  display: grid;
  gap: 4px;
  padding: 6px 0 2px;
  font-family: var(--pos-mono);
}
.totals-block div {
  display: flex;
  justify-content: space-between;
  color: var(--pos-muted);
  font-size: 0.86rem;
}
.totals-block .grand {
  margin-top: 4px;
  padding-top: 8px;
  border-top: 1px dashed rgba(255, 255, 255, 0.16);
  color: var(--pos-ink);
  font-size: 1.05rem;
}
.totals-block .grand strong {
  font-size: 1.35rem;
  color: #dff3bf;
}
.totals-block .change strong {
  color: #9fd86a;
}
.totals-block.compact { padding: 8px 0 0; }

.charge-btn {
  min-height: 56px;
  border: none;
  border-radius: 6px;
  font-size: 1.05rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  cursor: pointer;
  color: #0d1609;
  background: linear-gradient(180deg, #95d24f, #5f9a2d);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25);
}
.charge-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  box-shadow: none;
}
.charge-btn.secondary {
  background: #2a3624;
  color: var(--pos-ink);
  box-shadow: none;
  border: 1px solid var(--pos-line);
}

.inventory-note {
  padding: 20px;
  display: grid;
  gap: 12px;
  align-content: start;
}
.inventory-note h3 { margin: 0; }
.inventory-note p { margin: 0; color: var(--pos-muted); line-height: 1.45; }

.ghost-btn,
.primary-btn {
  min-height: 38px;
  border-radius: 6px;
  padding: 0 12px;
  font-weight: 700;
  cursor: pointer;
}
.ghost-btn {
  border: 1px solid var(--pos-line);
  background: transparent;
  color: var(--pos-ink);
}
.ghost-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.danger-text { color: #ffb4a8 !important; }
.primary-btn {
  border: none;
  color: #0d1609;
  background: linear-gradient(180deg, #95d24f, #5f9a2d);
}

.notice {
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 0.86rem;
}
.notice.ok,
.notice.success { background: rgba(124, 179, 66, 0.18); color: #dff0c8; }
.notice.error { background: rgba(224, 90, 74, 0.18); color: #ffd0c8; }

.admin-grid {
  display: grid;
  gap: 10px;
}
.panel { padding: 14px; }
.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 12px;
}
.panel-head h3 { margin: 0; }
.panel-head p { margin: 4px 0 0; color: var(--pos-muted); font-size: 0.86rem; }

.pos-users-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 12px;
}
.pos-users-form input {
  min-height: 42px;
  border-radius: 6px;
  border: 1px solid var(--pos-line);
  background: var(--pos-panel-2);
  color: var(--pos-ink);
  padding: 0 10px;
}
.pos-users-form button { grid-column: 1 / -1; }
.pos-users-hint {
  grid-column: 1 / -1;
  margin: 0;
  font-size: 0.85rem;
  color: #5a6b52;
  line-height: 1.35;
}

.table-wrap {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
.table {
  width: 100%;
  border-collapse: collapse;
  min-width: 560px;
}
.table th,
.table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--pos-line);
  text-align: left;
}
.table th {
  color: var(--pos-muted);
  font-size: 0.74rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.empty { text-align: center; color: var(--pos-muted); padding: 18px; }
.empty-state {
  grid-column: 1 / -1;
  text-align: center;
  color: var(--pos-muted);
  padding: 40px 12px;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 80;
}
.modal {
  position: fixed;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: min(560px, calc(100vw - 24px));
  max-height: calc(100dvh - 32px);
  overflow: auto;
  z-index: 90;
  background: var(--pos-panel);
  border: 1px solid var(--pos-line);
  border-radius: 8px;
  padding: 16px;
}
.modal h3 { margin: 0 0 8px; }
.meta { color: var(--pos-muted); margin: 0 0 12px; font-size: 0.88rem; font-family: var(--pos-mono); }
.modal-actions { display: flex; justify-content: flex-end; margin-top: 12px; }

@media (max-width: 1100px) {
  .pos-workbench {
    grid-template-columns: 1fr;
    height: auto;
    min-height: 0;
  }
  .ticket,
  .catalog {
    min-height: auto;
    height: auto;
  }
  .ticket {
    position: relative;
    z-index: 1;
    max-height: min(72vh, 720px);
    box-shadow: 0 8px 24px rgba(28, 42, 32, 0.08);
  }
}

@media (max-width: 760px) {
  .pos-topbar {
    grid-template-columns: 1fr;
  }
  .pos-tabs {
    justify-content: flex-start;
    overflow-x: auto;
    flex-wrap: nowrap;
    -webkit-overflow-scrolling: touch;
  }
  .pos-tab {
    flex: 0 0 auto;
    min-height: 42px;
  }
  .topbar-actions {
    justify-content: space-between;
  }
  .product-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .tender-pad {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .display-strip strong {
    font-size: 1.4rem;
  }
  .charge-btn {
    min-height: 52px;
  }
  .pos-users-form { grid-template-columns: 1fr; }
  .table { min-width: 0; }
  .table thead { display: none; }
  .table tr,
  .table td {
    display: block;
    width: 100%;
  }
  .table tr {
    margin-bottom: 10px;
    padding: 10px;
    border: 1px solid var(--pos-line);
    border-radius: 6px;
  }
  .table td {
    border: none;
    padding: 4px 0;
  }
  .table td::before {
    content: attr(data-label);
    display: block;
    font-size: 0.72rem;
    color: var(--pos-muted);
  }
  .table td:not([data-label])::before { display: none; }
}

/* Bright retail workspace */
.pos-page {
  --pos-ink: #26312a;
  --pos-muted: #778079;
  --pos-panel: #ffffff;
  --pos-panel-2: #f6f8f6;
  --pos-line: #e6ebe7;
  --pos-accent: #ff765f;
  --pos-accent-deep: #ef5c47;
  min-height: calc(100dvh - 76px);
  color: var(--pos-ink);
  font-size: 16px;
  min-width: 0;
}
.pos-page:not(.owner-mode) .brand-block { display: none; }
.pos-page:not(.owner-mode) .pos-topbar {
  grid-template-columns: minmax(0, 1fr) auto;
}
.pos-topbar,
.catalog,
.ticket,
.panel {
  background: #fff;
  border-color: var(--pos-line);
  border-radius: 14px;
  box-shadow: 0 8px 24px rgba(28, 42, 32, 0.06);
}
.brand-mark,
.chip.active {
  background: linear-gradient(135deg, var(--pos-accent), var(--pos-accent-deep));
  color: #fff;
}
.pos-tab { color: #6f7771; }
.pos-tab.active {
  background: #fff0ec;
  border-color: #ffc9be;
  color: #cf4f3d;
}
.clock { color: #758078; }
.catalog-toolbar,
.ticket-lines,
.ticket-pay {
  background: #fff;
  border-color: var(--pos-line);
}
.search-input,
.pay-fields input,
.line-controls input,
.pos-users-form input {
  background: #f7f9f7;
  border-color: #dde5df;
  color: var(--pos-ink);
}
.chip {
  background: #f5f7f5;
  border-color: #e2e8e3;
  color: #69726b;
}
.product-grid {
  grid-template-columns: repeat(auto-fill, minmax(155px, 1fr));
  gap: 12px;
  background: #fafbfa;
}
.sku-tile {
  min-height: 206px;
  padding: 0;
  overflow: hidden;
  align-content: stretch;
  gap: 0;
  border-radius: 12px;
  border-color: #e2e8e3;
  background: #fff;
  box-shadow: 0 5px 15px rgba(32, 44, 35, 0.05);
}
.sku-tile:hover:not(:disabled) {
  transform: translateY(-2px);
  border-color: #ffad9f;
  background: #fff;
  box-shadow: 0 10px 22px rgba(239, 92, 71, 0.12);
}
.sku-thumb {
  width: 100%;
  height: 122px;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: linear-gradient(135deg, #f0f4ee, #e5ecdf);
  color: #6d8e5c;
  font-size: 2rem;
  font-weight: 800;
}
.sku-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.sku-details {
  min-width: 0;
  display: grid;
  gap: 5px;
  padding: 10px;
}
.sku-details > small {
  color: #929a94;
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.sku-name {
  min-height: 2.2em;
  color: #26312a;
  font-size: 0.88rem;
}
.sku-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.sku-price {
  color: #e75d48;
  font-size: 0.96rem;
  font-family: inherit;
}
.sku-stock {
  padding: 3px 6px;
  border-radius: 999px;
  background: #edf5e8;
  color: #527640;
  font-size: 0.66rem;
  font-family: inherit;
}
.sku-stock.low { background: #fff2d7; color: #9a6a00; }
.sku-stock.out { background: #ffe4df; color: #b73f30; }
.display-strip {
  background: #fff8f6;
  border-color: #ffd7cf;
  color: var(--pos-ink);
}
.display-strip span { color: #a06b62; }
.display-strip strong { color: #df5945; }
.ticket-head,
.ticket-pay { border-color: var(--pos-line); }
.ticket-line {
  grid-template-columns: 46px minmax(0, 1fr);
  background: #fafbfa;
  border-color: #e5eae6;
  border-radius: 10px;
}
.line-thumb {
  grid-row: 1 / span 2;
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 9px;
  background: #e8eee5;
  color: #668153;
  font-weight: 800;
}
.line-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.line-main,
.line-controls { grid-column: 2; }
.line-main span { color: #879089; }
.line-controls input { background: #fff; }
.qty-btn,
.remove-btn,
.tender-btn {
  background: #fff;
  border-color: #dfe6e0;
  color: #536059;
}
.remove-btn { color: #d44f3c; }
.line-total { color: #26312a; }
.pay-mode {
  color: #707971;
  border-color: #dfe5e0;
}
.pay-mode.active {
  color: #d5513f;
  background: #fff0ec;
  border-color: #ffc4b8;
}
.pay-fields label { color: #737d75; }
.tender-btn { color: #4f5c54; }
.tender-btn:not(:disabled):active { background: #fff0ec; }
.totals-block div { color: #788179; }
.totals-block .grand {
  border-color: #dfe5e0;
  color: #29342d;
}
.totals-block .grand strong { color: #df5945; }
.totals-block .change strong { color: #4f8a3c; }
.charge-btn,
.primary-btn {
  color: #fff;
  background: linear-gradient(135deg, var(--pos-accent), var(--pos-accent-deep));
  box-shadow: 0 10px 20px rgba(239, 92, 71, 0.22);
}
.charge-btn.secondary {
  color: #4d5b51;
  background: #f4f7f3;
}
.ghost-btn {
  color: #556159;
  border-color: #dfe5e0;
  background: #fff;
}
.danger-text { color: #d5513f !important; }
.notice.ok,
.notice.success { background: #eaf6e2; color: #3e6c2d; }
.notice.error { background: #ffe8e3; color: #a63e30; }
.table th { color: #788179; }
.table th,
.table td { border-color: #e7ebe8; }
.modal {
  color: var(--pos-ink);
  background: #fff;
  border-color: #e2e7e3;
}
.ticket-head-actions {
  display: flex;
  align-items: center;
  gap: 7px;
}
.mobile-close-btn,
.mobile-cart-bar,
.mobile-ticket-backdrop {
  display: none;
}

@media (max-width: 760px) {
  .pos-page {
    min-height: auto;
    gap: 8px;
    font-size: 16px;
    padding-bottom: calc(78px + env(safe-area-inset-bottom, 0px));
  }
  .pos-page:not(.owner-mode) .pos-topbar,
  .pos-topbar {
    grid-template-columns: 1fr;
    padding: 9px;
  }
  .pos-tabs {
    width: 100%;
    justify-content: stretch;
  }
  .pos-tab {
    flex: 1 0 auto;
    min-width: 70px;
    font-size: 0.82rem;
  }
  .topbar-actions {
    display: none;
  }
  .clock { display: none; }
  .pos-workbench { gap: 8px; }
  .pos-workbench { height: auto; }
  .catalog { min-height: auto; }
  .catalog-toolbar { padding: 9px; }
  .product-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    max-height: none;
    padding: 9px;
    gap: 8px;
    overflow: visible;
  }
  .sku-tile { min-height: 174px; }
  .sku-thumb { height: 96px; }
  .sku-details { padding: 8px; }
  .pos-workbench > .ticket:not(.inventory-note) {
    display: none;
  }
  .pos-workbench > .ticket.mobile-open {
    position: fixed;
    inset: max(10px, env(safe-area-inset-top, 0px)) 8px max(8px, env(safe-area-inset-bottom, 0px));
    z-index: 110;
    display: grid;
    grid-template-rows: auto auto minmax(100px, 1fr) auto;
    min-height: 0;
    max-height: none;
    overflow: hidden;
    border-radius: 18px;
    box-shadow: 0 24px 60px rgba(23, 34, 26, 0.28);
  }
  .ticket-lines {
    min-height: 100px;
    max-height: none;
    overflow-y: auto;
  }
  .ticket-pay {
    max-height: 56vh;
    padding: 10px;
    overflow-y: auto;
  }
  .display-strip strong { font-size: 1.45rem; }
  .tender-pad { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .tender-btn { min-height: 44px; }
  .mobile-close-btn {
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    border: 1px solid #dfe5e0;
    border-radius: 10px;
    background: #f5f7f5;
    color: #4b574f;
    font-size: 1.4rem;
    cursor: pointer;
  }
  .mobile-cart-bar {
    position: fixed;
    left: 8px;
    right: 8px;
    bottom: calc(8px + env(safe-area-inset-bottom, 0px));
    z-index: 90;
    min-height: 64px;
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border: 0;
    border-radius: 16px;
    background: linear-gradient(135deg, #ff765f, #ef5c47);
    color: #fff;
    text-align: left;
    box-shadow: 0 14px 30px rgba(203, 70, 51, 0.34);
    cursor: pointer;
  }
  .mobile-cart-bar:disabled {
    background: #8b958e;
    box-shadow: 0 8px 18px rgba(30, 42, 33, 0.16);
    cursor: default;
  }
  .mobile-cart-count {
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
    border-radius: 11px;
    background: rgba(255, 255, 255, 0.2);
    font-weight: 800;
  }
  .mobile-cart-bar > span:nth-child(2) {
    display: grid;
    gap: 1px;
  }
  .mobile-cart-bar small { opacity: 0.88; }
  .mobile-cart-bar strong { font-size: 1.05rem; }
  .mobile-cart-bar b { font-size: 0.82rem; white-space: nowrap; }
  .mobile-ticket-backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: block;
    background: rgba(21, 31, 24, 0.52);
    backdrop-filter: blur(2px);
  }
}

@media (max-width: 390px) {
  .product-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .sku-thumb { height: 88px; }
  .sku-name { font-size: 0.82rem; }
  .pay-fields { grid-template-columns: 1fr; }
  .pay-fields label.full { grid-column: auto; }
  .tender-pad { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

/* Keep ticket controls inside the available register column. */
.pos-page,
.pos-workbench,
.ticket,
.ticket-lines,
.ticket-pay,
.ticket-line,
.line-main,
.line-controls,
.pay-fields,
.pay-fields label,
.tender-pad {
  min-width: 0;
}
.ticket {
  width: 100%;
  max-width: 100%;
  overflow-x: hidden;
}
.ticket-lines {
  overflow-x: hidden;
  overflow-y: auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-content: normal;
}
.ticket-pay {
  max-height: none;
  overflow: visible;
}
.display-strip,
.ticket-head,
.ticket-pay,
.line-main,
.line-controls {
  max-width: 100%;
}
.display-strip strong,
.line-main strong,
.line-main span {
  min-width: 0;
  overflow-wrap: anywhere;
}
.ticket-line {
  overflow: hidden;
  flex: 0 0 auto;
  min-height: 72px;
}
.line-main {
  flex-wrap: wrap;
}
.line-controls {
  flex-wrap: wrap;
}
.line-controls input {
  flex: 0 1 52px;
  min-width: 0;
}
.line-total {
  flex: 1 0 100%;
  margin-left: 0;
  text-align: right;
}
.pay-fields input,
.pay-fields label,
.charge-btn {
  width: 100%;
  max-width: 100%;
  min-width: 0;
}
.pay-fields label {
  overflow: hidden;
}
.tender-btn {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Match the main system palette. */
.pos-page {
  --pos-accent: #7cb342;
  --pos-accent-deep: #4e7d32;
}
.pos-tab.active {
  background: #edf6e5;
  border-color: #b9d69f;
  color: #4e7d32;
}
.chip.active,
.brand-mark,
.charge-btn,
.primary-btn {
  background: linear-gradient(135deg, #7cb342, #4e7d32);
}
.sku-price,
.display-strip strong,
.totals-block .grand strong {
  color: #4e7d32;
}
.display-strip {
  background: #f3f9ed;
  border-color: #c9dfb8;
}
.display-strip span {
  color: #5d7b4d;
}
.pay-mode.active {
  color: #4e7d32;
  background: #edf6e5;
  border-color: #b9d69f;
}
.charge-btn {
  box-shadow: 0 10px 20px rgba(78, 125, 50, 0.22);
}
.mobile-cart-bar {
  background: linear-gradient(135deg, #7cb342, #4e7d32);
  box-shadow: 0 14px 30px rgba(78, 125, 50, 0.34);
}
@media (max-width: 760px) {
  .pos-workbench > .ticket.mobile-open .ticket-pay {
    max-height: 56vh;
    overflow-y: auto;
  }
}
@media (min-width: 761px) and (max-height: 850px) {
  .pos-workbench {
    height: calc(100dvh - 132px);
    min-height: 460px;
  }
  .ticket-pay {
    padding: 6px;
    gap: 4px;
  }
  .pay-toggles {
    gap: 4px;
  }
  .pay-mode {
    min-height: 34px;
    font-size: 0.78rem;
  }
  .pay-fields {
    gap: 4px;
  }
  .pay-fields label {
    gap: 2px;
    font-size: 0.62rem;
  }
  .pay-fields input {
    min-height: 34px;
    padding: 0 7px;
  }
  .tender-pad {
    gap: 4px;
  }
  .tender-btn {
    min-height: 30px;
    font-size: 0.7rem;
  }
  .totals-block {
    gap: 2px;
    padding: 2px 0;
  }
  .totals-block div {
    font-size: 0.74rem;
  }
  .totals-block .grand {
    margin-top: 2px;
    padding-top: 4px;
    font-size: 0.9rem;
  }
  .totals-block .grand strong {
    font-size: 1.08rem;
  }
  .charge-btn {
    min-height: 42px;
    font-size: 0.86rem;
  }
}
</style>
