<template>
  <div class="owner-dashboard" :class="{ dark: darkMode }">
    <header class="topbar glass">
      <div class="top-left">
        <div class="logo-mark">S</div>
        <div>
          <div class="store-name">{{ user.store_name || 'Store Dashboard' }}</div>
          <div class="sub-name">Store Owner Console</div>
        </div>
      </div>

      <div class="top-search">
        <span>⌕</span>
        <input
          v-model="globalSearch"
          class="search-input"
          placeholder="Search orders, products, customers"
          @keydown.enter="handleGlobalSearch"
        />
      </div>

      <div class="top-right">
        <select v-model="datePreset" class="field" @change="applyDatePreset">
          <option value="7d">Last 7 Days</option>
          <option value="30d">Last 30 Days</option>
          <option value="custom">Custom</option>
        </select>
        <div v-if="datePreset==='custom'" class="date-fields">
          <input type="date" v-model="from" class="field" @change="loadDashboardData" />
          <input type="date" v-model="to" class="field" @change="loadDashboardData" />
        </div>
        <button class="icon-btn" aria-label="Notifications">🔔</button>

        <div class="avatar-menu" @click="showUserMenu = !showUserMenu">
          <div class="avatar">{{ initials }}</div>
          <span class="name">{{ user.full_name || 'Store Admin' }}</span>
          <span class="caret">▾</span>
          <div v-if="showUserMenu" class="dropdown glass" @click.stop>
            <button @click="goTo('StoreAccountProfile')">Profile</button>
            <button @click="goTo('StoreAccountSecurity')">Security</button>
            <button @click="goTo('StoreReports')">Billing</button>
            <button @click="darkMode = !darkMode">{{ darkMode ? 'Light Mode' : 'Dark Mode' }}</button>
            <button @click="handleLogout">Logout</button>
          </div>
        </div>
      </div>
    </header>

    <div class="layout" :class="{ 'sidebar-is-collapsed': sidebarCollapsed }">
      <aside class="sidebar glass" :class="{ collapsed: sidebarCollapsed }">
        <button class="collapse-btn" @click="sidebarCollapsed = !sidebarCollapsed">{{ sidebarCollapsed ? '›' : '‹' }}</button>
        <nav class="menu desktop-menu">
          <button
            v-for="item in visibleMenuItems"
            :key="item.key"
            class="nav-item"
            :class="{ active: isRouteActive(item), logout: item.key==='logout' }"
            :title="item.label"
            @click="onMenuClick(item)"
          >
            <span class="icon">{{ item.icon }}</span>
            <span class="nav-label" v-if="!sidebarCollapsed">{{ item.label }}</span>
          </button>
        </nav>
        <nav class="menu mobile-menu" aria-label="Primary">
          <button
            v-for="item in mobilePrimaryItems"
            :key="'m-' + item.key"
            class="nav-item"
            :class="{ active: isRouteActive(item) }"
            :title="item.label"
            @click="onMenuClick(item)"
          >
            <span class="icon">{{ item.icon }}</span>
            <span class="nav-label">{{ item.short || item.label }}</span>
          </button>
          <button
            class="nav-item more-btn"
            :class="{ active: mobileMoreOpen || isMoreRouteActive }"
            title="More"
            @click="mobileMoreOpen = !mobileMoreOpen"
          >
            <span class="icon">☰</span>
            <span class="nav-label">More</span>
          </button>
        </nav>
      </aside>

      <div
        v-if="mobileMoreOpen"
        class="mobile-more-overlay"
        @click="mobileMoreOpen = false"
      >
        <div class="mobile-more-sheet glass" @click.stop>
          <div class="mobile-more-head">
            <h3>More</h3>
            <button type="button" class="sheet-close" aria-label="Close" @click="mobileMoreOpen = false">✕</button>
          </div>
          <button
            v-for="item in mobileMoreItems"
            :key="'more-' + item.key"
            class="mobile-more-item"
            :class="{ active: isRouteActive(item), danger: item.key === 'logout' }"
            @click="onMenuClick(item)"
          >
            <span class="icon">{{ item.icon }}</span>
            <span>{{ item.label }}</span>
          </button>
        </div>
      </div>

      <main class="main">
        <section v-if="isDashboardHome" class="overview">
          <section class="welcome glass">
            <div>
              <h1>Welcome back, Store Admin 👋</h1>
              <p>Here’s what’s happening in your store today.</p>
            </div>
          </section>

          <section class="cash-grid">
            <article class="cash-card glass">
              <span class="cash-label">Total Cash In</span>
              <strong class="cash-value">{{ formatCurrency(cashSummary.total_cash_in) }}</strong>
            </article>
            <article class="cash-card glass">
              <span class="cash-label">Total Cash Out</span>
              <strong class="cash-value">{{ formatCurrency(cashSummary.total_cash_out) }}</strong>
            </article>
            <article class="cash-card glass">
              <span class="cash-label">Net Cash Balance</span>
              <strong class="cash-value">{{ formatCurrency(cashSummary.net_cash) }}</strong>
            </article>
          </section>

          <section class="kpi-grid">
            <article class="kpi-card" v-for="card in kpiCards" :key="card.key">
              <div class="kpi-topbar"></div>
              <div class="kpi-head">
                <span class="label">{{ card.label }}</span>
                <span class="growth" :class="card.growth >= 0 ? 'up' : 'down'">
                  {{ card.growth >= 0 ? '↑' : '↓' }} {{ Math.abs(card.growth).toFixed(1) }}%
                </span>
              </div>
              <div class="value">{{ card.value }}</div>
              <svg class="spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
                <polyline :points="card.spark" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
              </svg>
            </article>
          </section>

          <section class="charts-grid">
            <article class="chart-card glass">
              <div class="card-head">
                <h3>Revenue Trend</h3>
                <div class="segmented">
                  <button :class="{active: trendMode==='daily'}" @click="trendMode='daily'">Daily</button>
                  <button :class="{active: trendMode==='weekly'}" @click="trendMode='weekly'">Weekly</button>
                  <button :class="{active: trendMode==='monthly'}" @click="trendMode='monthly'">Monthly</button>
                </div>
              </div>
              <div class="line-wrap">
                <svg class="line-chart" viewBox="0 0 420 180" preserveAspectRatio="none">
                  <polyline :points="trendLinePoints" fill="none" stroke="#6B9E3E" stroke-width="3" stroke-linecap="round" />
                </svg>
              </div>
            </article>

            <article class="chart-card glass">
              <div class="card-head">
                <h3>Orders Status Breakdown</h3>
              </div>
              <div class="donut-wrap">
                <div class="donut" :style="{ background: statusDonutGradient }">
                  <div class="donut-hole">{{ totalStatusOrders }}</div>
                </div>
                <ul class="legend">
                  <li><span class="dot pending"></span>Pending ({{ analytics.countPending || 0 }})</li>
                  <li><span class="dot way"></span>On The Way ({{ analytics.countOnTheWay || 0 }})</li>
                  <li><span class="dot delivered"></span>Delivered ({{ analytics.countDelivered || 0 }})</li>
                  <li><span class="dot rejected"></span>Rejected ({{ analytics.countRejected || 0 }})</li>
                </ul>
              </div>
            </article>
          </section>

          <section class="insights-grid">
            <article class="glass insight-card">
              <h3>Top Selling Products</h3>
              <div class="list-row" v-for="p in (analytics.topProducts || []).slice(0,5)" :key="p.id">
                <div class="thumb-sm"></div>
                <div class="grow">
                  <strong>{{ p.name }}</strong>
                  <small>{{ p.soldQty }} sold</small>
                </div>
                <span>{{ formatCurrency(p.revenue) }}</span>
              </div>
              <div v-if="!(analytics.topProducts||[]).length" class="empty">No product data yet.</div>
            </article>

            <article class="glass insight-card">
              <h3>Revenue by Category</h3>
              <div v-for="c in revenueByCategoryBars" :key="c.category" class="bar-row">
                <div class="bar-head">
                  <span>{{ c.category }}</span>
                  <strong>{{ formatCurrency(c.revenue) }}</strong>
                </div>
                <div class="bar-track">
                  <div class="bar-fill" :style="{ width: c.pct + '%' }"></div>
                </div>
              </div>
              <div v-if="!revenueByCategoryBars.length" class="empty">No category data yet.</div>
            </article>

            <article class="glass insight-card">
              <h3>Best Performing Day</h3>
              <div class="best-day">{{ bestDayLabel }}</div>
              <p class="muted">Highest delivered revenue within selected range.</p>
            </article>

            <article class="glass insight-card">
              <h3>Inventory Alerts</h3>
              <div class="alert-badges">
                <span class="badge warning" v-for="item in lowStock.slice(0,6)" :key="item.id">
                  {{ item.name }} ({{ item.stock }})
                </span>
                <span class="empty" v-if="!lowStock.length">No low stock alerts.</span>
              </div>
            </article>
          </section>

          <section class="glass ai-panel">
            <h3>AI Insights</h3>
            <ul>
              <li>{{ aiInsights.salesGrowth }}</li>
              <li>{{ aiInsights.lowStock }}</li>
              <li>{{ aiInsights.peakTime }}</li>
            </ul>
          </section>
        </section>

        <section v-else class="glass child-content">
          <router-view />
        </section>
      </main>
    </div>

    <button class="ai-fab" title="AI Assistant">✨</button>
  </div>
</template>

<script>
import api from '../services/api'

export default {
  name: 'StoreOwnerDashboard',
  data() {
    const today = new Date()
    const to = today.toISOString().slice(0, 10)
    const fromDate = new Date(today)
    fromDate.setDate(today.getDate() - 30)
    const from = fromDate.toISOString().slice(0, 10)
    return {
      sidebarCollapsed: false,
      showUserMenu: false,
      mobileMoreOpen: false,
      darkMode: false,
      mobilePrimaryKeys: ['dashboard', 'products', 'orders', 'inventory', 'pos'],
      globalSearch: '',
      datePreset: '30d',
      from,
      to,
      trendMode: 'daily',
      analytics: {},
      trendRows: [],
      cashSummary: {
        total_cash_in: 0,
        total_cash_out: 0,
        net_cash: 0
      },
      lowStock: [],
      featureFlags: {},
      menuItems: [
        { key: 'dashboard', label: 'Dashboard', short: 'Home', icon: '⌂', route: 'StoreHome' },
        { key: 'products', label: 'Products', short: 'Products', icon: '▣', route: 'StoreProducts', feature: 'products' },
        { key: 'orders', label: 'Orders', short: 'Orders', icon: '▤', route: 'StoreOrdersAll', feature: 'orders' },
        { key: 'inventory', label: 'Inventory', short: 'Stock', icon: '▥', route: 'StoreInventoryAll', feature: 'inventory' },
        { key: 'customers', label: 'Customers', short: 'Customers', icon: '♙', route: 'StoreCustomers', feature: 'customers' },
        { key: 'reports', label: 'Reports', short: 'Reports', icon: '▥', route: 'StoreReports', feature: 'reports' },
        { key: 'cashflow', label: 'Cash Flow', short: 'Cash', icon: '₱', route: 'StoreCashFlow', feature: 'cashflow' },
        { key: 'cashflow2', label: 'Cash Flow 2', short: 'Cash 2', icon: '₱', route: 'StoreCashFlow2', feature: 'cashflow2' },
        { key: 'forecasting', label: 'Forecasting', short: 'Forecast', icon: '↗', route: 'StoreForecasting', feature: 'forecasting' },
        { key: 'features', label: 'Features', short: 'Features', icon: '⚙', route: 'StoreFeaturesManagement' },
        { key: 'rewards', label: 'Rewards', short: 'Rewards', icon: '★', route: 'StoreRewards' },
        { key: 'logistics', label: 'Delivery Service', short: 'Delivery', icon: '➤', route: 'StoreLogistics', feature: 'logistics' },
        { key: 'notifications', label: 'Notifications', short: 'Alerts', icon: '●', route: 'StoreNotifications', feature: 'notifications' },
        { key: 'pos', label: 'POS', short: 'POS', icon: '▤', route: 'StorePOS', feature: 'pos' },
        { key: 'maps', label: 'Maps', short: 'Maps', icon: '⌖', route: 'StoreAccountLocation' },
        { key: 'settings', label: 'Settings', short: 'Settings', icon: '⚙', route: 'StoreAccountProfile' },
        { key: 'logout', label: 'Logout', short: 'Logout', icon: '↪', action: 'logout' }
      ]
    }
  },
  computed: {
    user() {
      return JSON.parse(localStorage.getItem('user') || '{}')
    },
    initials() {
      const full = this.user.full_name || 'SA'
      return full.split(' ').map(x => x[0]).slice(0, 2).join('').toUpperCase()
    },
    isStore3() {
      const id = Number(this.user.id || 0)
      const storeName = String(this.user.store_name || '').toLowerCase()
      return id === 3 || storeName.includes('3')
    },
    visibleMenuItems() {
      return this.menuItems.filter((item) => {
        if (!item.feature) return true
        return this.featureFlags[item.feature] !== false
      })
    },
    mobilePrimaryItems() {
      return this.visibleMenuItems.filter((item) => this.mobilePrimaryKeys.includes(item.key))
    },
    mobileMoreItems() {
      return this.visibleMenuItems.filter((item) => !this.mobilePrimaryKeys.includes(item.key))
    },
    isMoreRouteActive() {
      return this.mobileMoreItems.some((item) => this.isRouteActive(item))
    },
    isDashboardHome() {
      return this.$route.name === 'StoreHome' || this.$route.name === 'StoreOwnerDashboard'
    },
    totalStatusOrders() {
      return Number(this.analytics.countPending || 0) + Number(this.analytics.countOnTheWay || 0) + Number(this.analytics.countDelivered || 0) + Number(this.analytics.countRejected || 0)
    },
    displayedTrend() {
      const rows = this.normalizedTrendRows
      if (this.trendMode === 'daily') return rows
      if (this.trendMode === 'weekly') return this.groupByBuckets(rows, 7)
      if (this.trendMode === 'monthly') return this.groupByMonth(rows)
      return rows
    },
    trendLinePoints() {
      const rows = this.displayedTrend
      const values = rows.map(r => Number(r.revenue || 0))
      if (!values.length) return '0,160 420,160'
      const max = Math.max(...values, 1)
      const step = values.length > 1 ? 420 / (values.length - 1) : 420
      return values.map((value, idx) => {
        const x = idx * step
        const y = 160 - (value / max) * 140
        return `${x},${Math.max(12, y)}`
      }).join(' ')
    },
    statusDonutGradient() {
      const pending = Number(this.analytics.countPending || 0)
      const way = Number(this.analytics.countOnTheWay || 0)
      const delivered = Number(this.analytics.countDelivered || 0)
      const rejected = Number(this.analytics.countRejected || 0)
      const total = Math.max(1, pending + way + delivered + rejected)
      const a = (pending / total) * 360
      const b = a + (way / total) * 360
      const c = b + (delivered / total) * 360
      return `conic-gradient(#6B9E3E 0deg ${a}deg, #8FBF4D ${a}deg ${b}deg, #3E7A24 ${b}deg ${c}deg, #C96A3D ${c}deg 360deg)`
    },
    revenueByCategoryBars() {
      const rows = Array.isArray(this.analytics.revenueByCategory)
        ? this.analytics.revenueByCategory
        : Array.isArray(this.analytics.revenueByCategory?.rows)
          ? this.analytics.revenueByCategory.rows
          : Array.isArray(this.analytics.revenueByCategory?.data)
            ? this.analytics.revenueByCategory.data
            : []
      const max = Math.max(...rows.map(r => Number(r.revenue || 0)), 1)
      return rows.slice(0, 6).map(r => ({
        category: r.category,
        revenue: Number(r.revenue || 0),
        pct: Math.round((Number(r.revenue || 0) / max) * 100)
      }))
    },
    bestDayLabel() {
      const rows = this.normalizedTrendRows
      if (!rows.length) return 'No data yet'
      const best = rows.reduce((acc, cur) => Number(cur.revenue || 0) > Number(acc.revenue || 0) ? cur : acc, rows[0])
      return `${new Date(best.day).toLocaleDateString()} · ${this.formatCurrency(best.revenue)}`
    },
    kpiCards() {
      const delivered = Number(this.analytics.countDelivered || 0)
      const totalOrders = Number(this.analytics.totalOrders || 0)
      const revenue = Number(this.analytics.totalSales || 0)
      const aov = Number(this.analytics.aovDelivered || 0)
      const items = Number(this.analytics.itemsSold || 0)
      const conversion = totalOrders > 0 ? (delivered / totalOrders) * 100 : 0
      const refund = totalOrders > 0 ? (Number(this.analytics.countRejected || 0) / totalOrders) * 100 : 0
      const values = this.normalizedTrendRows.map(x => Number(x.revenue || 0))
      const spark = this.sparkline(values)
      const growth = this.growthFromTrend(values)

      return [
        { key: 'orders', label: 'Total Orders', value: totalOrders, growth, spark },
        { key: 'revenue', label: 'Total Revenue', value: this.formatCurrency(revenue), growth, spark },
        { key: 'aov', label: 'Average Order Value', value: this.formatCurrency(aov), growth: growth * 0.8, spark },
        { key: 'items', label: 'Items Sold', value: items, growth: growth * 0.9, spark },
        { key: 'conversion', label: 'Conversion Rate', value: `${conversion.toFixed(1)}%`, growth: growth * 0.5, spark },
        { key: 'refund', label: 'Refund Rate', value: `${refund.toFixed(1)}%`, growth: -Math.abs(growth * 0.3), spark }
      ]
    },
    aiInsights() {
      const growth = this.kpiCards[1]?.growth || 0
      const lowCount = this.lowStock.length
      return {
        salesGrowth: `Your sales ${growth >= 0 ? 'increased' : 'decreased'} ${Math.abs(growth).toFixed(1)}% compared to the previous period.`,
        lowStock: lowCount ? `You are low on ${lowCount} high-demand product${lowCount > 1 ? 's' : ''}.` : 'Inventory levels are healthy across all tracked items.',
        peakTime: 'Peak sales time: 7PM–9PM.'
      }
    },
    normalizedTrendRows() {
      return this.normalizeRows(this.trendRows)
    }
  },
  watch: {
    '$route.name'() {
      this.showUserMenu = false
      this.mobileMoreOpen = false
      if (this.isDashboardHome) this.loadDashboardData()
    }
  },
  mounted() {
    this.loadFeatures()
    this.loadDashboardData()
    document.addEventListener('click', this.handleOutsideClick)
  },
  beforeUnmount() {
    document.removeEventListener('click', this.handleOutsideClick)
  },
  methods: {
    normalizeRows(payload) {
      if (Array.isArray(payload)) return payload
      if (Array.isArray(payload?.rows)) return payload.rows
      if (Array.isArray(payload?.data)) return payload.data
      if (Array.isArray(payload?.daily)) return payload.daily
      return []
    },
    async loadFeatures() {
      try {
        const { data } = await api.get('/store/features/me')
        this.featureFlags = data?.features || {}
      } catch (_) {
        this.featureFlags = {}
      }
    },
    goTo(name) {
      this.showUserMenu = false
      this.$router.push({ name })
    },
    onMenuClick(item) {
      this.mobileMoreOpen = false
      if (item.action === 'logout') return this.handleLogout()
      if (item.route) this.$router.push({ name: item.route })
    },
    isRouteActive(item) {
      if (!item.route) return false
      const route = this.$route.name || ''
      if (item.route === 'StoreHome') return route === 'StoreHome' || route === 'StoreOwnerDashboard'
      if (item.route === 'StoreOrdersAll') return String(route).startsWith('StoreOrders')
      if (item.route === 'StoreInventoryAll') return String(route).startsWith('StoreInventory')
      if (item.route === 'StoreCustomers') return route === 'StoreCustomers'
      if (item.route === 'StoreCashFlow') return route === 'StoreCashFlow'
      if (item.route === 'StoreCashFlow2') return route === 'StoreCashFlow2'
      if (item.route === 'StoreAccountLocation') return route === 'StoreAccountLocation'
      if (item.route === 'StoreAccountProfile') {
        return route === 'StoreAccountProfile' || route === 'StoreAccountSecurity'
      }
      return route === item.route
    },
    handleOutsideClick(evt) {
      if (this.showUserMenu) {
        const menu = this.$el?.querySelector('.avatar-menu')
        if (menu && !menu.contains(evt.target)) this.showUserMenu = false
      }
      if (this.mobileMoreOpen) {
        const sheet = this.$el?.querySelector('.mobile-more-sheet')
        const moreBtn = this.$el?.querySelector('.more-btn')
        if (sheet && !sheet.contains(evt.target) && moreBtn && !moreBtn.contains(evt.target)) {
          this.mobileMoreOpen = false
        }
      }
    },
    handleLogout() {
      this.$store.dispatch('logout')
      this.$router.push('/admin/login')
    },
    handleGlobalSearch() {
      const q = (this.globalSearch || '').trim().toLowerCase()
      if (!q) return
      if (q.includes('product')) return this.$router.push({ name: 'StoreProducts' })
      if (q.includes('order')) return this.$router.push({ name: 'StoreOrdersAll' })
      if (q.includes('customer')) return this.$router.push({ name: 'StoreCustomers' })
      if (q.includes('forecast') || q.includes('prediction') || q.includes('ml')) return this.$router.push({ name: 'StoreForecasting' })
      if (q.includes('report')) return this.$router.push({ name: 'StoreReports' })
      if (q.includes('quickbook') || q.includes('journal') || q.includes('ledger 2')) return this.$router.push({ name: 'StoreCashFlow2' })
      if (q.includes('cash') || q.includes('flow') || q.includes('profit') || q.includes('loss') || q.includes('account')) return this.$router.push({ name: 'StoreCashFlow' })
      this.$router.push({ name: 'StoreProducts' })
    },
    applyDatePreset() {
      const today = new Date()
      const end = today.toISOString().slice(0, 10)
      if (this.datePreset === 'custom') {
        this.to = end
        return
      }
      const start = new Date(today)
      start.setDate(today.getDate() - (this.datePreset === '7d' ? 7 : 30))
      this.from = start.toISOString().slice(0, 10)
      this.to = end
      this.loadDashboardData()
    },
    async loadDashboardData() {
      try {
        const [analyticsRes, trendRes, lowStockRes, cashSummaryRes] = await Promise.all([
          api.get('/store/analytics'),
          api.get('/store/reports/sales', { params: { from: this.from, to: this.to } }),
          api.get('/store/inventory/low', { params: { threshold: 10 } }),
          api.get('/cash/summary')
        ])
        this.analytics = analyticsRes.data || {}
        this.trendRows = this.normalizeRows(trendRes.data)
        this.lowStock = this.normalizeRows(lowStockRes.data)
        this.cashSummary = cashSummaryRes.data || {
          total_cash_in: 0,
          total_cash_out: 0,
          net_cash: 0
        }
      } catch (err) {
        console.error('Failed to load dashboard data', err)
      }
    },
    groupByBuckets(rows, size) {
      rows = this.normalizeRows(rows)
      const output = []
      for (let index = 0; index < rows.length; index += size) {
        const slice = rows.slice(index, index + size)
        const revenue = slice.reduce((sum, row) => sum + Number(row.revenue || 0), 0)
        output.push({
          day: slice[slice.length - 1]?.day,
          revenue
        })
      }
      return output
    },
    groupByMonth(rows) {
      rows = this.normalizeRows(rows)
      const map = {}
      for (const row of rows) {
        const month = String(row.day || '').slice(0, 7)
        map[month] = (map[month] || 0) + Number(row.revenue || 0)
      }
      return Object.keys(map).sort().map(month => ({ day: `${month}-01`, revenue: map[month] }))
    },
    sparkline(values) {
      if (!values.length) return '0,20 100,20'
      const max = Math.max(...values, 1)
      const step = values.length > 1 ? 100 / (values.length - 1) : 100
      return values.map((value, index) => {
        const x = index * step
        const y = 24 - (value / max) * 18
        return `${x},${Math.max(2, y)}`
      }).join(' ')
    },
    growthFromTrend(values) {
      if (values.length < 2) return 0
      const mid = Math.floor(values.length / 2)
      const first = values.slice(0, mid).reduce((a, b) => a + b, 0)
      const second = values.slice(mid).reduce((a, b) => a + b, 0)
      if (!first) return second > 0 ? 100 : 0
      return ((second - first) / first) * 100
    },
    formatCurrency(value) {
      const number = Number(value || 0)
      return number.toLocaleString(undefined, { style: 'currency', currency: 'PHP' })
    }
  }
}
</script>

<style scoped>
.owner-dashboard {
  --bg: #F8FAFC;
  --text: #111827;
  --muted: #6B7280;
  --surface: rgba(255,255,255,0.84);
  --surface-2: #FFFFFF;
  --line: rgba(30,41,59,0.08);
  --shadow: 0 12px 28px rgba(15, 23, 42, 0.08);
  --primary-a: #7CB342;
  --primary-b: #4E7D32;
  min-height: 100vh;
  background: radial-gradient(circle at top right, #F1F7E8 0%, #EAF2DE 48%);
  color: var(--text);
  font-family: Inter, 'SF Pro Text', 'Segoe UI', sans-serif;
}

.owner-dashboard.dark {
  --bg: #0F1A10;
  --text: #E5E7EB;
  --muted: #9CA3AF;
  --surface: rgba(18,30,18,0.82);
  --surface-2: #132316;
  --line: rgba(148,163,184,0.2);
  --shadow: 0 12px 28px rgba(2,6,23,0.5);
  background: radial-gradient(circle at top right, #1F331F 0%, var(--bg) 52%);
}

.glass {
  background: var(--surface);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255,255,255,0.45);
  box-shadow: var(--shadow);
  border-radius: 18px;
}
.owner-dashboard.dark .glass {
  border-color: rgba(148,163,184,0.16);
}

.topbar {
  position: fixed;
  z-index: 50;
  top: 12px;
  left: 16px;
  right: 16px;
  height: 74px;
  display: grid;
  grid-template-columns: 260px 1fr auto;
  gap: 16px;
  align-items: center;
  padding: 0 16px;
}
.top-left { display:flex; align-items:center; gap:10px; }
.logo-mark {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  display:grid;
  place-items:center;
  color:#fff;
  font-weight: 700;
  background: linear-gradient(135deg, var(--primary-a), var(--primary-b));
}
.store-name { font-weight: 700; }
.sub-name { color: var(--muted); font-size: 12px; }

.top-search {
  height: 44px;
  border-radius: 999px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  display:flex;
  align-items:center;
  gap: 8px;
  padding: 0 12px;
}
.search-input {
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text);
}

.top-right {
  display:flex;
  align-items:center;
  gap: 8px;
}
.date-fields { display:flex; gap:8px; }
.field {
  min-height: 38px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--text);
  padding: 0 10px;
}
.icon-btn {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  cursor: pointer;
}

.avatar-menu {
  position: relative;
  display:flex;
  align-items:center;
  gap: 8px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 4px 10px 4px 4px;
  cursor: pointer;
}
.avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display:grid;
  place-items:center;
  color:#fff;
  font-weight: 700;
  background: linear-gradient(135deg, var(--primary-a), var(--primary-b));
}
.name { font-size: 13px; max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.caret { font-size: 11px; color: var(--muted); }

.dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 170px;
  display:grid;
  gap: 4px;
  padding: 8px;
}
.dropdown button {
  border: none;
  background: transparent;
  color: var(--text);
  text-align: left;
  border-radius: 10px;
  padding: 8px 10px;
  cursor: pointer;
}
.dropdown button:hover { background: rgba(78,125,50,0.14); }

.layout {
  display: grid;
  grid-template-columns: 260px 1fr;
  gap: 16px;
  padding: 100px 16px 20px;
}
.layout.sidebar-is-collapsed {
  grid-template-columns: 74px minmax(0, 1fr);
}

.sidebar {
  position: sticky;
  top: 96px;
  align-self: start;
  padding: 12px;
  min-height: calc(100vh - 120px);
}
.sidebar.collapsed {
  width: 74px;
  padding-left: 8px;
  padding-right: 8px;
}
.sidebar.collapsed .nav-item {
  justify-content: center;
  padding-left: 0;
  padding-right: 0;
}
.sidebar.collapsed .nav-item .icon {
  width: 28px;
  text-align: center;
  font-size: 1.25rem;
  line-height: 1;
}
.collapse-btn {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--text);
  cursor: pointer;
  margin-bottom: 10px;
}

.menu { display:grid; gap: 6px; }
.nav-item {
  position: relative;
  border: none;
  background: transparent;
  color: var(--text);
  border-radius: 12px;
  min-height: 42px;
  padding: 0 12px;
  display:flex;
  gap: 10px;
  align-items:center;
  cursor: pointer;
  transition: all 220ms cubic-bezier(.2,.8,.2,1);
}
.nav-item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 10px;
  bottom: 10px;
  width: 3px;
  border-radius: 2px;
  transform: scaleY(0);
  background: linear-gradient(180deg, var(--primary-a), var(--primary-b));
}
.nav-item:hover {
  background: rgba(78,125,50,0.1);
  box-shadow: 0 8px 16px rgba(78,125,50,0.18);
}
.nav-item.active {
  background: rgba(124,179,66,0.2);
  color: #2E5C1D;
}
.owner-dashboard.dark .nav-item.active { color: #D9F2BF; }
.nav-item.active::before { transform: scaleY(1); }
.nav-item.logout { margin-top: 8px; }

.mobile-menu { display: none; }
.mobile-more-overlay { display: none; }

.main { display:grid; gap: 16px; }

.welcome {
  padding: 18px 20px;
}
.welcome h1 { margin: 0 0 4px; font-size: 1.7rem; }
.welcome p { margin: 0; color: var(--muted); }

.cash-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.cash-card {
  padding: 14px;
  display: grid;
  gap: 6px;
}
.cash-label {
  color: var(--muted);
  font-size: 13px;
}
.cash-value {
  font-size: 1.35rem;
}

.kpi-grid {
  display:grid;
  grid-template-columns: repeat(6, minmax(0,1fr));
  gap: 12px;
}
.kpi-card {
  background: #fff;
  border-radius: 16px;
  box-shadow: var(--shadow);
  border: 1px solid var(--line);
  overflow: hidden;
  padding: 0 12px 10px;
  transition: transform 220ms cubic-bezier(.2,.8,.2,1);
}
.owner-dashboard.dark .kpi-card { background: var(--surface-2); }
.kpi-card:hover { transform: translateY(-3px); }
.kpi-topbar {
  height: 4px;
  margin: 0 -12px 10px;
  background: linear-gradient(90deg, var(--primary-a), var(--primary-b));
}
.kpi-head { display:flex; justify-content: space-between; align-items:center; gap:6px; }
.label { color: var(--muted); font-size: 12px; }
.growth { font-size: 12px; font-weight: 700; }
.growth.up { color: #22C55E; }
.growth.down { color: #EF4444; }
.value { font-size: 1.4rem; font-weight: 800; margin: 6px 0; }
.spark { width: 100%; height: 28px; color: #6B9E3E; }

.charts-grid {
  display:grid;
  grid-template-columns: 2fr 1fr;
  gap: 12px;
}
.chart-card { padding: 14px; }
.card-head {
  display:flex;
  justify-content: space-between;
  align-items:center;
  gap: 10px;
  margin-bottom: 10px;
}
.card-head h3 { margin: 0; font-size: 1rem; }
.segmented {
  display:flex;
  gap: 6px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 4px;
}
.segmented button {
  border: none;
  border-radius: 8px;
  padding: 6px 10px;
  background: transparent;
  cursor: pointer;
  color: var(--text);
}
.segmented button.active {
  color: #fff;
  background: linear-gradient(135deg, var(--primary-a), var(--primary-b));
}
.line-wrap { height: 200px; border-radius: 14px; background: var(--surface-2); border: 1px solid var(--line); padding: 10px; }
.line-chart { width: 100%; height: 100%; }

.donut-wrap {
  display:grid;
  grid-template-columns: auto 1fr;
  gap: 14px;
  align-items:center;
}
.donut {
  width: 136px;
  height: 136px;
  border-radius: 50%;
  display:grid;
  place-items:center;
}
.donut-hole {
  width: 84px;
  height: 84px;
  border-radius: 50%;
  background: var(--surface-2);
  border: 1px solid var(--line);
  display:grid;
  place-items:center;
  font-weight: 700;
}
.legend { list-style: none; margin: 0; padding: 0; display:grid; gap: 8px; }
.legend li { display:flex; align-items:center; gap:8px; font-size: 13px; }
.dot { width: 10px; height: 10px; border-radius: 50%; display:inline-block; }
.dot.pending { background: #6B9E3E; }
.dot.way { background: #8FBF4D; }
.dot.delivered { background: #3E7A24; }
.dot.rejected { background: #C96A3D; }

.insights-grid {
  display:grid;
  grid-template-columns: repeat(2, minmax(0,1fr));
  gap: 12px;
}
.insight-card { padding: 14px; }
.insight-card h3 { margin: 0 0 10px; font-size: 1rem; }
.list-row {
  display:flex;
  align-items:center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px dashed var(--line);
}
.thumb-sm {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: linear-gradient(135deg, rgba(124,179,66,0.28), rgba(176,122,46,0.16));
}
.grow { flex: 1; display:grid; }
.grow small { color: var(--muted); }

.bar-row { margin-bottom: 10px; }
.bar-head { display:flex; justify-content:space-between; margin-bottom: 6px; font-size: 13px; }
.bar-track {
  width: 100%;
  height: 8px;
  border-radius: 999px;
  background: rgba(148,163,184,0.3);
  overflow: hidden;
}
.bar-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--primary-a), var(--primary-b));
}
.best-day { font-size: 1.1rem; font-weight: 700; margin-bottom: 6px; }
.muted { color: var(--muted); margin: 0; }

.alert-badges { display:flex; flex-wrap:wrap; gap:8px; }
.badge.warning {
  background: rgba(176,122,46,0.2);
  color: #7C4A1E;
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 12px;
}
.owner-dashboard.dark .badge.warning { color: #F5DEB3; }

.ai-panel { padding: 14px; }
.ai-panel h3 { margin: 0 0 8px; }
.ai-panel ul { margin: 0; padding-left: 18px; display:grid; gap: 6px; }

.child-content { padding: 16px; }

.empty { color: var(--muted); font-size: 13px; }

.ai-fab {
  position: fixed;
  right: 20px;
  bottom: 20px;
  width: 54px;
  height: 54px;
  border: none;
  border-radius: 50%;
  color: #fff;
  cursor: pointer;
  background: linear-gradient(135deg, var(--primary-a), var(--primary-b));
  box-shadow: 0 14px 28px rgba(58,134,255,0.35);
}

@media (max-width: 1400px) {
  .kpi-grid { grid-template-columns: repeat(3, minmax(0,1fr)); }
}

@media (max-width: 1024px) {
  .charts-grid,
  .cash-grid,
  .insights-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 900px) {
  .owner-dashboard { overflow-x: hidden; }
  .topbar {
    left: 10px;
    right: 10px;
    top: 8px;
    grid-template-columns: 1fr auto;
    gap: 8px;
    padding: 8px 10px;
    height: auto;
    border-radius: 16px;
  }
  .sub-name,
  .name,
  .date-fields,
  .top-right .field { display: none; }
  .top-search {
    grid-column: 1 / -1;
    grid-row: 2;
    height: 42px;
  }
  .top-right { gap: 6px; }
  .icon-btn {
    width: 42px;
    height: 42px;
  }
  .layout {
    display: block;
    padding: 118px 12px calc(92px + env(safe-area-inset-bottom, 0px));
  }
  .desktop-menu,
  .collapse-btn { display: none; }
  .mobile-menu { display: flex; }
  .sidebar {
    position: fixed;
    left: 10px;
    right: 10px;
    bottom: calc(10px + env(safe-area-inset-bottom, 0px));
    z-index: 55;
    min-height: 0;
    width: auto !important;
    padding: 8px 6px;
    overflow: visible;
    border-radius: 18px;
  }
  .menu {
    display: flex;
    gap: 4px;
    width: 100%;
    justify-content: space-between;
    min-width: 0;
  }
  .nav-item {
    flex: 1 1 0;
    min-width: 0;
    min-height: 52px;
    flex-direction: column;
    justify-content: center;
    gap: 3px;
    padding: 6px 4px;
    margin: 0;
    border-radius: 14px;
  }
  .nav-item.logout { margin-top: 0; }
  .nav-item::before { display: none; }
  .nav-item .nav-label {
    display: block;
    font-size: 10px;
    font-weight: 600;
    line-height: 1.1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
  .nav-item .icon { font-size: 1.15rem; line-height: 1; }
  .kpi-grid,
  .cash-grid {
    grid-template-columns: 1fr;
  }
  .welcome {
    padding: 14px;
  }
  .welcome h1 { font-size: 1.2rem; }
  .child-content,
  .main {
    max-width: 100%;
    overflow-x: hidden;
  }
  .child-content :deep(.table-wrap),
  .main :deep(.table-wrap) {
    width: 100%;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    margin: 0 -2px;
  }
  .child-content :deep(table),
  .main :deep(.table) {
    min-width: 520px;
  }
  .child-content :deep(.toolbar),
  .main :deep(.toolbar) {
    flex-wrap: wrap;
    gap: 8px;
  }
  .ai-fab {
    right: 14px;
    bottom: calc(84px + env(safe-area-inset-bottom, 0px));
    width: 50px;
    height: 50px;
  }

  .mobile-more-overlay {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 70;
    background: rgba(15, 23, 42, 0.42);
    padding: 16px 12px calc(100px + env(safe-area-inset-bottom, 0px));
  }
  .mobile-more-sheet {
    position: absolute;
    left: 12px;
    right: 12px;
    bottom: calc(88px + env(safe-area-inset-bottom, 0px));
    max-height: min(62vh, 480px);
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    padding: 12px;
    border-radius: 18px;
  }
  .mobile-more-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
    padding: 0 4px 8px;
    border-bottom: 1px solid var(--line);
  }
  .mobile-more-head h3 {
    margin: 0;
    font-size: 1rem;
  }
  .sheet-close {
    width: 36px;
    height: 36px;
    border: none;
    border-radius: 10px;
    background: var(--surface-2);
    color: var(--text);
    cursor: pointer;
  }
  .mobile-more-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 48px;
    padding: 10px 12px;
    border: none;
    border-radius: 12px;
    background: transparent;
    color: var(--text);
    text-align: left;
    font-size: 0.95rem;
    cursor: pointer;
  }
  .mobile-more-item:hover,
  .mobile-more-item.active {
    background: rgba(78, 125, 50, 0.14);
  }
  .mobile-more-item.danger { color: #b42318; }
  .mobile-more-item .icon { width: 24px; text-align: center; }
}

@media (max-width: 420px) {
  .topbar { left: 8px; right: 8px; }
  .layout { padding-left: 8px; padding-right: 8px; }
  .nav-item .nav-label { font-size: 9px; }
  .sidebar {
    left: 8px;
    right: 8px;
  }
}
</style>
