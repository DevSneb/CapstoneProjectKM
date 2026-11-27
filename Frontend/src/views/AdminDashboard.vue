<template>
  <div class="admin-shell" :class="{ dark: darkMode }">
    <header class="topbar glass">
      <div class="left-brand">
        <div class="logo">K</div>
        <div>
          <div class="name">Kadiwa Admin</div>
          <div class="sub">Multi-store Control Center</div>
        </div>
      </div>

      <div class="global-search">
        <span>⌕</span>
        <input
          v-model="globalSearch"
          placeholder="Search stores, products, orders, users"
          @keydown.enter="runGlobalSearch"
        />
      </div>

      <div class="top-actions">
        <div class="status-pill"><span class="dot"></span>All Systems Operational</div>
        <button class="icon-btn" title="Notifications">🔔<span class="alert-badge" v-if="alertsCount">{{ alertsCount }}</span></button>
        <div class="avatar-menu" @click="showUserMenu = !showUserMenu">
          <div class="avatar">{{ initials }}</div>
          <span class="user-name">{{ user.full_name || 'Admin' }}</span>
          <span class="caret">▾</span>
          <div v-if="showUserMenu" class="dropdown glass" @click.stop>
            <button @click="goTo('AdminAccountSettings')">Profile</button>
            <button @click="goTo('AdminAccountSettings')">System Settings</button>
            <button @click="darkMode=!darkMode">{{ darkMode ? 'Light Mode' : 'Dark Mode' }}</button>
            <button @click="handleLogout">Logout</button>
          </div>
        </div>
      </div>
    </header>

    <div class="layout">
      <aside class="sidebar glass" :class="{ collapsed: sidebarCollapsed }">
        <button class="collapse-btn" @click="sidebarCollapsed = !sidebarCollapsed">{{ sidebarCollapsed ? '›' : '‹' }}</button>
        <nav class="menu">
          <button
            v-for="item in menu"
            :key="item.key"
            class="menu-item"
            :class="{ active: isMenuActive(item), logout: item.key==='logout', 'mobile-secondary': item.key==='settings' || item.key==='logout' }"
            :title="item.label"
            @click="onMenu(item)"
          >
            <span class="mi">{{ item.icon }}</span>
            <span class="nav-label long" v-if="!sidebarCollapsed">{{ item.label }}</span>
            <span class="nav-label short">{{ item.short || item.label }}</span>
          </button>
        </nav>
      </aside>

      <main class="main">
        <section v-if="isOverviewRoute" class="overview">
          <div class="hero glass">
            <h1>Admin Overview</h1>
            <p>Platform-wide monitoring and control for all stores.</p>
          </div>

          <section class="kpi-grid">
            <article class="kpi-card" v-for="k in kpis" :key="k.key">
              <div class="accent"></div>
              <div class="kpi-head">
                <span class="label">{{ k.label }}</span>
                <span class="delta" :class="k.growth >= 0 ? 'up' : 'down'">
                  {{ k.growth >= 0 ? '↑' : '↓' }} {{ Math.abs(k.growth).toFixed(1) }}%
                </span>
              </div>
              <div class="value">{{ k.value }}</div>
              <svg class="spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
                <polyline :points="k.spark" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
              </svg>
            </article>
          </section>

          <section class="charts-grid">
            <article class="chart-card glass">
              <div class="card-head">
                <h3>Revenue Trend</h3>
                <div class="controls">
                  <div class="segmented">
                    <button :class="{active: trendMode==='daily'}" @click="trendMode='daily'">Daily</button>
                    <button :class="{active: trendMode==='weekly'}" @click="trendMode='weekly'">Weekly</button>
                    <button :class="{active: trendMode==='monthly'}" @click="trendMode='monthly'">Monthly</button>
                  </div>
                  <input type="date" v-model="from" @change="reload" class="field" />
                  <input type="date" v-model="to" @change="reload" class="field" />
                </div>
              </div>
              <div class="line-wrap">
                <svg class="line-chart" viewBox="0 0 500 220" preserveAspectRatio="none">
                  <polyline :points="trendPoints" fill="none" stroke="#4E7D32" stroke-width="3" stroke-linecap="round" />
                </svg>
              </div>
            </article>

            <article class="chart-card glass">
              <div class="card-head"><h3>Order Status Distribution</h3></div>
              <div class="donut-wrap">
                <div class="donut" :style="{ background: donutGradient }">
                  <div class="donut-hole">{{ totalStatus }}</div>
                </div>
                <ul class="legend">
                  <li><span class="dot pending"></span>Pending ({{ detailed.countPending || 0 }})</li>
                  <li><span class="dot way"></span>On The Way ({{ detailed.countOnTheWay || 0 }})</li>
                  <li><span class="dot delivered"></span>Delivered ({{ detailed.countDelivered || 0 }})</li>
                  <li><span class="dot rejected"></span>Rejected ({{ detailed.countRejected || 0 }})</li>
                </ul>
              </div>
            </article>
          </section>

          <section class="glass perf-section">
            <div class="section-head">
              <h3>Multi-Store Performance</h3>
              <div class="table-tools">
                <input class="field" v-model="storeSearch" placeholder="Search store" />
                <select class="field" v-model="storeStatusFilter">
                  <option value="">All Status</option>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </select>
                <button class="btn secondary" @click="exportStoresCSV">Export CSV</button>
              </div>
            </div>

            <div class="table-wrap">
              <table class="table store-table">
                <thead>
                  <tr>
                    <th @click="sortStores('store_name')">Store Name</th>
                    <th @click="sortStores('revenue')">Revenue</th>
                    <th @click="sortStores('orders')">Orders</th>
                    <th @click="sortStores('margin')">Avg Margin</th>
                    <th>Top Product</th>
                    <th @click="sortStores('growth')">Growth %</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in pagedStores" :key="row.id">
                    <td>{{ row.store_name }}</td>
                    <td>{{ formatCurrency(row.revenue) }}</td>
                    <td>{{ row.orders }}</td>
                    <td>{{ row.margin.toFixed(1) }}%</td>
                    <td>{{ row.topProduct || '—' }}</td>
                    <td :class="row.growth >=0 ? 'up' : 'down'">{{ row.growth.toFixed(1) }}%</td>
                    <td><span class="status" :class="row.status">{{ row.status }}</span></td>
                  </tr>
                  <tr v-if="!filteredStoreRows.length"><td colspan="7" class="empty">No stores found.</td></tr>
                </tbody>
              </table>
            </div>

            <div class="pagination">
              <button class="btn" @click="storePage=Math.max(1, storePage-1)" :disabled="storePage===1">Prev</button>
              <span>Page {{ storePage }} / {{ storeTotalPages }}</span>
              <button class="btn" @click="storePage=Math.min(storeTotalPages, storePage+1)" :disabled="storePage===storeTotalPages">Next</button>
            </div>
          </section>

          <section class="glass price-section">
            <div class="section-head">
              <h3>Advanced Price Monitoring</h3>
              <div class="table-tools">
                <select class="field" v-model="marginFilter">
                  <option value="">All Margins</option>
                  <option value="healthy">Healthy</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
                <input class="field" v-model="priceSearch" placeholder="Filter product" />
              </div>
            </div>

            <div class="margin-summary">
              <div class="sum-card"><span>Healthy</span><strong>{{ marginSummary.healthy }}</strong></div>
              <div class="sum-card"><span>Medium</span><strong>{{ marginSummary.medium }}</strong></div>
              <div class="sum-card"><span>Low</span><strong>{{ marginSummary.low }}</strong></div>
            </div>

            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>Store</th><th>Product</th><th>Category</th><th>Price</th><th>Cost</th><th>SRP</th><th>Margin</th><th>Price Change</th><th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="p in filteredPriceRows" :key="p.id">
                    <td>{{ p.store_name }}</td>
                    <td>{{ p.name }}</td>
                    <td>{{ p.category || '—' }}</td>
                    <td>{{ formatCurrency(p.price) }}</td>
                    <td>{{ formatCurrency(p.cost) }}</td>
                    <td>{{ formatCurrency(p.srp) }}</td>
                    <td><span class="margin-badge" :class="marginClass(p)">{{ marginPct(p).toFixed(1) }}%</span></td>
                    <td :class="priceDelta(p) >=0 ? 'up':'down'">{{ priceDelta(p) >=0 ? '↑':'↓' }} {{ Math.abs(priceDelta(p)).toFixed(2) }}</td>
                    <td><span class="time-badge">{{ new Date(p.updated_at).toLocaleString() }}</span></td>
                  </tr>
                  <tr v-if="!filteredPriceRows.length"><td colspan="9" class="empty">No products in selected filter.</td></tr>
                </tbody>
              </table>
            </div>
          </section>
        </section>

        <section v-else class="glass child-view">
          <router-view />
        </section>
      </main>
    </div>
  </div>
</template>

<script>
import api from '../services/api'

export default {
  name: 'AdminDashboard',
  data(){
    const today = new Date()
    const to = today.toISOString().slice(0,10)
    const fromDate = new Date(today)
    fromDate.setDate(today.getDate()-30)
    return {
      darkMode: false,
      showUserMenu: false,
      sidebarCollapsed: false,
      globalSearch: '',
      alertsCount: 5,
      from: fromDate.toISOString().slice(0,10),
      to,
      trendMode: 'daily',
      stats: { stores:0, customers:0, orders:0, products:0, sales_total:0 },
      detailed: { countPending:0, countOnTheWay:0, countDelivered:0, countRejected:0, aovDelivered:0, itemsSold:0, dailyRevenue7:[], monthlyRevenue6:[] },
      stores: [],
      submissions: [],
      priceRows: [],
      storeSearch: '',
      storeStatusFilter: '',
      storeSortBy: 'revenue',
      storeSortDir: 'desc',
      storePage: 1,
      storePageSize: 8,
      marginFilter: '',
      priceSearch: '',
      menu: [
        { key:'overview', label:'Dashboard', short:'Home', icon:'◻', route:'AdminHome' },
        { key:'sales', label:'Sales Reports', short:'Sales', icon:'◧', route:'AdminSalesReports' },
        { key:'price', label:'Price Monitoring', short:'Prices', icon:'◨', route:'AdminPriceMonitoring' },
        { key:'market', label:'Market Prices', short:'Market', icon:'◎', route:'AdminMarketPrices' },
        { key:'stores', label:'Stores Management', short:'Stores', icon:'◩', route:'AdminStores' },
        { key:'household', label:'Household', short:'Homes', icon:'⌂', route:'AdminHousehold' },
        { key:'settings', label:'Account Settings', short:'Account', icon:'◯', route:'AdminAccountSettings' },
        { key:'logout', label:'Logout', short:'Logout', icon:'↩', action:'logout' }
      ]
    }
  },
  computed:{
    user(){ return JSON.parse(localStorage.getItem('user') || '{}') },
    initials(){
      const full = this.user.full_name || 'AD'
      return full.split(' ').map(x => x[0]).slice(0,2).join('').toUpperCase()
    },
    isOverviewRoute(){
      return this.$route.name === 'AdminHome' || this.$route.name === 'AdminDashboard'
    },
    trendRows(){
      const daily = this.detailed.dailyRevenue7 || []
      const monthly = this.detailed.monthlyRevenue6 || []
      if(this.trendMode==='daily') return daily.map(r=>({ label:r.day, revenue:Number(r.revenue||0) }))
      if(this.trendMode==='weekly') return this.groupWeekly(daily)
      return monthly.map(r=>({ label:r.month, revenue:Number(r.revenue||0) }))
    },
    trendPoints(){
      const values = this.trendRows.map(r=>r.revenue)
      if(!values.length) return '0,170 500,170'
      const max = Math.max(...values, 1)
      const step = values.length>1 ? 500/(values.length-1) : 500
      return values.map((v,i)=>`${i*step},${170 - (v/max)*140}`).join(' ')
    },
    totalStatus(){
      return Number(this.detailed.countPending||0) + Number(this.detailed.countOnTheWay||0) + Number(this.detailed.countDelivered||0) + Number(this.detailed.countRejected||0)
    },
    donutGradient(){
      const pending = Number(this.detailed.countPending||0)
      const way = Number(this.detailed.countOnTheWay||0)
      const delivered = Number(this.detailed.countDelivered||0)
      const rejected = Number(this.detailed.countRejected||0)
      const total = Math.max(1, pending+way+delivered+rejected)
      const a = (pending/total)*360
      const b = a + (way/total)*360
      const c = b + (delivered/total)*360
      return `conic-gradient(#8FBF4D 0deg ${a}deg, #6B9E3E ${a}deg ${b}deg, #3E7A24 ${b}deg ${c}deg, #C96A3D ${c}deg 360deg)`
    },
    kpis(){
      const trendValues = this.trendRows.map(r=>r.revenue)
      const growth = this.computeGrowth(trendValues)
      const spark = this.sparkline(trendValues)
      const avgMargin = this.priceRows.length
        ? this.priceRows.reduce((sum,p)=>sum+this.marginPct(p),0)/this.priceRows.length
        : 0
      return [
        { key:'rev', label:'Total Platform Revenue', value:this.formatCurrency(this.stats.sales_total), growth, spark },
        { key:'ord', label:'Total Orders', value:this.stats.orders, growth:growth*0.8, spark },
        { key:'stores', label:'Total Active Stores', value:this.stores.filter(s=>s.status==='approved').length, growth:growth*0.5, spark },
        { key:'products', label:'Total Active Products', value:this.priceRows.filter(p=>p.status==='active').length, growth:growth*0.6, spark },
        { key:'margin', label:'Avg Platform Margin', value:`${avgMargin.toFixed(1)}%`, growth:growth*0.4, spark },
        { key:'growth', label:'Growth % (This Month)', value:`${growth.toFixed(1)}%`, growth, spark }
      ]
    },
    storeRows(){
      const byStore = {}
      for(const s of this.stores){
        byStore[s.id] = {
          id: s.id,
          store_name: s.store_name,
          status: s.status === 'approved' ? 'active' : 'suspended',
          revenue: 0,
          orders: 0,
          margin: 0,
          topProduct: '',
          growth: 0
        }
      }
      for(const sub of this.submissions){
        const row = byStore[sub.store_owner_id]
        if(!row) continue
        row.revenue += Number(sub.total_revenue || 0)
        row.orders += Number(sub.orders_count || 0)
      }
      const productsByStore = {}
      for(const p of this.priceRows){
        if(!productsByStore[p.store_owner_id]) productsByStore[p.store_owner_id] = []
        productsByStore[p.store_owner_id].push(p)
      }
      Object.values(byStore).forEach(row=>{
        const list = productsByStore[row.id] || []
        const margins = list.map(x=>this.marginPct(x))
        row.margin = margins.length ? margins.reduce((a,b)=>a+b,0)/margins.length : 0
        row.topProduct = list.sort((a,b)=>Number(b.price||0)-Number(a.price||0))[0]?.name || ''
        row.growth = row.orders ? Math.min(100, Math.max(-100, row.margin * 0.8)) : 0
      })
      return Object.values(byStore)
    },
    filteredStoreRows(){
      let rows = [...this.storeRows]
      if(this.storeSearch) rows = rows.filter(r=>String(r.store_name).toLowerCase().includes(this.storeSearch.toLowerCase()))
      if(this.storeStatusFilter) rows = rows.filter(r=>r.status===this.storeStatusFilter)
      rows.sort((a,b)=>{
        const av = a[this.storeSortBy]
        const bv = b[this.storeSortBy]
        const dir = this.storeSortDir === 'asc' ? 1 : -1
        if(typeof av === 'number' && typeof bv === 'number') return (av-bv)*dir
        return String(av).localeCompare(String(bv)) * dir
      })
      return rows
    },
    storeTotalPages(){ return Math.max(1, Math.ceil(this.filteredStoreRows.length / this.storePageSize)) },
    pagedStores(){
      const start = (this.storePage-1) * this.storePageSize
      return this.filteredStoreRows.slice(start, start + this.storePageSize)
    },
    filteredPriceRows(){
      let rows = [...this.priceRows]
      if(this.priceSearch){
        const q = this.priceSearch.toLowerCase()
        rows = rows.filter(r => String(r.name).toLowerCase().includes(q) || String(r.store_name).toLowerCase().includes(q) || String(r.category || '').toLowerCase().includes(q))
      }
      if(this.marginFilter){
        rows = rows.filter(r=>{
          const m = this.marginPct(r)
          if(this.marginFilter==='healthy') return m >= 25
          if(this.marginFilter==='medium') return m >= 10 && m < 25
          if(this.marginFilter==='low') return m < 10
          return true
        })
      }
      return rows
    },
    marginSummary(){
      const items = this.priceRows
      return {
        healthy: items.filter(i=>this.marginPct(i)>=25).length,
        medium: items.filter(i=>this.marginPct(i)>=10 && this.marginPct(i)<25).length,
        low: items.filter(i=>this.marginPct(i)<10).length
      }
    }
  },
  watch:{
    '$route.name'(){
      this.showUserMenu = false
      if(this.isOverviewRoute) this.reload()
    }
  },
  async mounted(){
    await this.reload()
    document.addEventListener('click', this.handleOutside)
  },
  beforeUnmount(){ document.removeEventListener('click', this.handleOutside) },
  methods:{
    async reload(){
      try{
        const [a,d,s,pm,subs] = await Promise.all([
          api.get('/admin/dashboard/analytics'),
          api.get('/admin/dashboard/analytics/detailed'),
          api.get('/admin/stores'),
          api.get('/admin/price-monitoring', { params: { page:1, pageSize:200 } }),
          api.get('/admin/reports/submissions')
        ])
        this.stats = a.data || this.stats
        this.detailed = d.data || this.detailed
        this.stores = s.data || []
        this.priceRows = pm.data?.rows || []
        this.submissions = subs.data || []
      }catch(err){
        console.error('Failed to load admin dashboard', err)
      }
    },
    goTo(name){ this.showUserMenu = false; this.$router.push({ name }) },
    onMenu(item){
      if(item.action === 'logout') return this.handleLogout()
      if(item.route) this.goTo(item.route)
    },
    isMenuActive(item){
      if(!item.route) return false
      const route = this.$route.name || ''
      if(item.route==='AdminHome') return route==='AdminHome' || route==='AdminDashboard'
      return route===item.route
    },
    handleOutside(evt){
      if(!this.showUserMenu) return
      const menu = this.$el?.querySelector('.avatar-menu')
      if(menu && !menu.contains(evt.target)) this.showUserMenu = false
    },
    handleLogout(){
      this.$store.dispatch('logout')
      this.$router.push('/admin/login')
    },
    runGlobalSearch(){
      const q = (this.globalSearch||'').toLowerCase()
      if(q.includes('price') || q.includes('product')) return this.goTo('AdminPriceMonitoring')
      if(q.includes('feature')) return this.goTo('AdminFeaturesManagement')
      if(q.includes('store') || q.includes('owner')) return this.goTo('AdminStores')
      if(q.includes('report') || q.includes('order')) return this.goTo('AdminSalesReports')
      if(q.includes('household') || q.includes('customer')) return this.goTo('AdminHousehold')
      if(q.includes('block') || q.includes('chain') || q.includes('integrity') || q.includes('hash')) return this.goTo('AdminIntegrityRecords')
      this.goTo('AdminHome')
    },
    sparkline(values){
      if(!values.length) return '0,20 100,20'
      const max = Math.max(...values, 1)
      const step = values.length>1 ? 100/(values.length-1) : 100
      return values.map((v,i)=>`${i*step},${24-(v/max)*18}`).join(' ')
    },
    computeGrowth(values){
      if(values.length < 2) return 0
      const mid = Math.floor(values.length/2)
      const first = values.slice(0,mid).reduce((a,b)=>a+b,0)
      const second = values.slice(mid).reduce((a,b)=>a+b,0)
      if(!first) return second ? 100 : 0
      return ((second-first)/first)*100
    },
    groupWeekly(rows){
      const out = []
      for(let i=0;i<rows.length;i+=7){
        const chunk = rows.slice(i,i+7)
        out.push({ label: chunk[chunk.length-1]?.day, revenue: chunk.reduce((s,r)=>s+Number(r.revenue||0),0) })
      }
      return out
    },
    formatCurrency(v){ return Number(v||0).toLocaleString(undefined,{ style:'currency', currency:'PHP' }) },
    marginPct(p){
      const price = Number(p.price || 0)
      const cost = Number(p.cost || 0)
      if(price <= 0) return 0
      return ((price - cost) / price) * 100
    },
    marginClass(p){
      const m = this.marginPct(p)
      if(m >= 25) return 'healthy'
      if(m >= 10) return 'medium'
      return 'low'
    },
    priceDelta(p){
      const price = Number(p.price || 0)
      const srp = Number(p.srp || 0)
      return price - srp
    },
    sortStores(col){
      if(this.storeSortBy === col){
        this.storeSortDir = this.storeSortDir === 'asc' ? 'desc' : 'asc'
      }else{
        this.storeSortBy = col
        this.storeSortDir = 'desc'
      }
    },
    exportStoresCSV(){
      const head = ['Store Name','Revenue','Orders','Avg Margin','Top Product','Growth %','Status']
      const rows = this.filteredStoreRows.map(r=>[
        r.store_name,
        Number(r.revenue||0).toFixed(2),
        r.orders,
        Number(r.margin||0).toFixed(2),
        r.topProduct || '',
        Number(r.growth||0).toFixed(2),
        r.status
      ])
      const csv = [head.join(','), ...rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'"')}"`).join(','))].join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'multi_store_performance.csv'
      a.click()
      URL.revokeObjectURL(url)
    }
  }
}
</script>

<style scoped>
.admin-shell {
  --bg: #F4F7F0;
  --text: #111827;
  --muted: #5F6C55;
  --surface: rgba(255,255,255,0.86);
  --surface-2: #FFFFFF;
  --line: rgba(56,92,35,0.16);
  --shadow: 0 14px 30px rgba(56,92,35,0.14);
  --primary-a: #7CB342;
  --primary-b: #4E7D32;
  min-height: 100vh;
  background: radial-gradient(circle at top right, #EAF2DE 0%, var(--bg) 46%);
  color: var(--text);
  font-family: Inter, 'IBM Plex Sans', 'Segoe UI', sans-serif;
}

.admin-shell.dark {
  --bg: #102112;
  --text: #E5E7EB;
  --muted: #A0B38E;
  --surface: rgba(20,37,20,0.84);
  --surface-2: #142916;
  --line: rgba(148,163,184,0.22);
  --shadow: 0 14px 30px rgba(2,6,23,0.56);
  background: radial-gradient(circle at top right, #1F331F 0%, var(--bg) 46%);
}

.glass {
  background: var(--surface);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255,255,255,0.45);
  box-shadow: var(--shadow);
  border-radius: 16px;
}
.admin-shell.dark .glass { border-color: rgba(148,163,184,0.14); }

.topbar {
  position: sticky;
  top: 0;
  z-index: 60;
  margin: 12px 16px 0;
  height: 74px;
  display: grid;
  grid-template-columns: 240px 1fr auto;
  align-items: center;
  gap: 16px;
  padding: 0 16px;
}
.left-brand { display:flex; align-items:center; gap:10px; }
.logo {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  display:grid;
  place-items:center;
  color:#fff;
  font-weight: 800;
  background: linear-gradient(135deg, var(--primary-a), var(--primary-b));
}
.name { font-weight: 700; }
.sub { font-size: 12px; color: var(--muted); }

.global-search {
  display:flex;
  align-items:center;
  gap:8px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  height: 44px;
  border-radius: 999px;
  padding: 0 12px;
}
.global-search input {
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text);
}

.top-actions { display:flex; align-items:center; gap:8px; }
.status-pill {
  display:flex;
  align-items:center;
  gap:8px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 8px 12px;
  font-size: 12px;
}
.dot { width: 8px; height: 8px; border-radius: 50%; background: #22C55E; }
.icon-btn {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  cursor: pointer;
  position: relative;
}
.alert-badge {
  position:absolute;
  top:-5px;
  right:-5px;
  background:#EF4444;
  color:#fff;
  border-radius: 999px;
  min-width: 16px;
  height: 16px;
  display:grid;
  place-items:center;
  font-size: 10px;
}

.avatar-menu {
  position:relative;
  display:flex;
  align-items:center;
  gap:8px;
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
  font-weight:700;
  background: linear-gradient(135deg, var(--primary-a), var(--primary-b));
}
.user-name { font-size: 13px; }
.caret { font-size: 11px; color: var(--muted); }
.dropdown {
  position:absolute;
  right:0;
  top: calc(100% + 8px);
  min-width: 180px;
  padding: 8px;
  display:grid;
  gap:4px;
}
.dropdown button {
  border:none;
  background:transparent;
  color: var(--text);
  border-radius: 10px;
  text-align:left;
  padding:8px 10px;
  cursor: pointer;
}
.dropdown button:hover { background: rgba(78,125,50,0.16); }

.layout {
  display:grid;
  grid-template-columns: 260px 1fr;
  gap: 16px;
  padding: 16px;
}

.sidebar {
  position: sticky;
  top: 98px;
  align-self: start;
  padding: 12px;
  min-height: calc(100vh - 120px);
}
.sidebar.collapsed { width: 74px; }
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
.menu { display:grid; gap:6px; }
.menu-item {
  position: relative;
  border: none;
  background: transparent;
  color: var(--text);
  border-radius: 12px;
  min-height: 42px;
  padding: 0 12px;
  display:flex;
  align-items:center;
  gap:10px;
  cursor:pointer;
  transition: all .22s cubic-bezier(.2,.8,.2,1);
}
.menu-item::before {
  content:'';
  position:absolute;
  left:0;
  top:9px;
  bottom:9px;
  width:3px;
  border-radius:2px;
  background: linear-gradient(180deg, var(--primary-a), var(--primary-b));
  transform: scaleY(0);
}
.menu-item:hover {
  background: rgba(78,125,50,0.12);
  box-shadow: 0 8px 16px rgba(56,92,35,0.16);
}
.menu-item.active {
  background: rgba(78,125,50,0.2);
}
.menu-item.active::before { transform: scaleY(1); }
.menu-item.logout { margin-top: 8px; }
.nav-label.short { display: none; }

.main { display:grid; gap:16px; }
.hero { padding: 16px; }
.hero h1 { margin:0 0 4px; font-size: 1.5rem; }
.hero p { margin:0; color: var(--muted); }

.kpi-grid {
  display:grid;
  grid-template-columns: repeat(6, minmax(0,1fr));
  gap: 12px;
}
.kpi-card {
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 0 12px 10px;
  box-shadow: var(--shadow);
  transition: transform .22s cubic-bezier(.2,.8,.2,1);
}
.kpi-card:hover { transform: translateY(-3px); }
.accent {
  height: 4px;
  margin: 0 -12px 10px;
  border-radius: 14px 14px 0 0;
  background: linear-gradient(90deg, var(--primary-a), var(--primary-b));
}
.kpi-head { display:flex; justify-content:space-between; gap:6px; align-items:center; }
.label { font-size: 12px; color: var(--muted); }
.delta { font-size: 12px; font-weight: 700; }
.delta.up { color: #16A34A; }
.delta.down { color: #DC2626; }
.value { margin: 6px 0; font-size: 1.25rem; font-weight: 800; }
.spark { width:100%; height: 28px; color: #4E7D32; }

.charts-grid {
  display:grid;
  grid-template-columns: 2fr 1fr;
  gap: 12px;
}
.chart-card { padding: 14px; }
.card-head { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:10px; }
.card-head h3 { margin:0; font-size: 1rem; }
.controls { display:flex; align-items:center; gap:8px; }
.field {
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--text);
  border-radius: 10px;
  min-height: 36px;
  padding: 0 10px;
}
.segmented {
  display:flex;
  gap:6px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  border-radius: 10px;
  padding: 4px;
}
.segmented button {
  border: none;
  background: transparent;
  color: var(--text);
  border-radius: 8px;
  padding: 6px 10px;
  cursor: pointer;
}
.segmented button.active {
  color:#fff;
  background: linear-gradient(135deg, var(--primary-a), var(--primary-b));
}
.line-wrap {
  height: 210px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface-2);
  padding: 10px;
}
.line-chart { width:100%; height:100%; }

.donut-wrap { display:grid; grid-template-columns: auto 1fr; gap: 12px; align-items:center; }
.donut {
  width: 140px;
  height: 140px;
  border-radius: 50%;
  display:grid;
  place-items:center;
}
.donut-hole {
  width: 86px;
  height: 86px;
  border-radius: 50%;
  display:grid;
  place-items:center;
  border: 1px solid var(--line);
  background: var(--surface-2);
  font-weight: 700;
}
.legend { list-style: none; margin: 0; padding: 0; display:grid; gap:8px; }
.legend li { display:flex; align-items:center; gap:8px; font-size: 13px; }
.legend .dot { width: 10px; height: 10px; }
.dot.pending { background:#8FBF4D; }
.dot.way { background:#6B9E3E; }
.dot.delivered { background:#3E7A24; }
.dot.rejected { background:#C96A3D; }

.perf-section,
.price-section { padding: 14px; }
.section-head { display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:10px; }
.section-head h3 { margin:0; }
.table-tools { display:flex; align-items:center; gap:8px; }

.table-wrap { max-height: 360px; overflow: auto; border-radius: 12px; border: 1px solid var(--line); }
.table {
  width:100%;
  border-collapse: collapse;
  background: var(--surface-2);
}
.table thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: rgba(124,179,66,0.14);
  backdrop-filter: blur(8px);
}
.table th,
.table td {
  text-align: left;
  padding: 10px 12px;
  border-bottom: 1px solid var(--line);
  font-size: 13px;
}
.table tbody tr:hover { background: rgba(124,179,66,0.1); }
.table th { cursor: pointer; }
.table th:last-child { cursor: default; }
.empty { text-align:center; color: var(--muted); }
.up { color:#16A34A; }
.down { color:#DC2626; }
.status {
  border-radius: 999px;
  padding: 4px 8px;
  font-size: 12px;
  font-weight: 600;
}
.status.active { background: rgba(34,197,94,0.18); color: #166534; }
.status.suspended { background: rgba(239,68,68,0.18); color: #991B1B; }
.actions { white-space: nowrap; }

.btn {
  border: none;
  border-radius: 10px;
  min-height: 34px;
  padding: 0 12px;
  color:#fff;
  cursor:pointer;
  background: linear-gradient(135deg, var(--primary-a), var(--primary-b));
}
.btn.secondary {
  background: var(--surface-2);
  color: var(--text);
  border: 1px solid var(--line);
}
.btn.warning { background: linear-gradient(135deg, #F59E0B, #D97706); }
.btn.mini { min-height: 30px; padding: 0 10px; font-size: 12px; }
.pagination {
  margin-top: 10px;
  display:flex;
  justify-content:flex-end;
  align-items:center;
  gap: 8px;
}

.margin-summary {
  display:grid;
  grid-template-columns: repeat(3, minmax(0,1fr));
  gap: 10px;
  margin-bottom: 10px;
}
.sum-card {
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 10px 12px;
  display:flex;
  justify-content:space-between;
  align-items:center;
}
.sum-card span { color: var(--muted); font-size: 12px; }
.sum-card strong { font-size: 1.1rem; }
.inline {
  width: 90px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--text);
  border-radius: 8px;
  min-height: 30px;
  padding: 0 8px;
}
.margin-badge {
  display:inline-block;
  border-radius: 999px;
  padding: 4px 8px;
  font-size: 12px;
  font-weight: 700;
}
.margin-badge.healthy { background: rgba(34,197,94,0.18); color: #166534; }
.margin-badge.medium { background: rgba(234,179,8,0.2); color: #854D0E; }
.margin-badge.low { background: rgba(239,68,68,0.2); color: #991B1B; }
.time-badge {
  background: rgba(148,163,184,0.2);
  border-radius: 999px;
  padding: 4px 8px;
  font-size: 12px;
}

.child-view { padding: 16px; }

.ai-actions { margin-top: 12px; display:flex; flex-wrap:wrap; gap:8px; }

@media (max-width: 1440px){
  .layout { grid-template-columns: 240px 1fr; }
  .ai-panel { grid-column: 1 / -1; position: static; }
  .kpi-grid { grid-template-columns: repeat(3,minmax(0,1fr)); }
}

@media (max-width: 1100px){
  .charts-grid { grid-template-columns: 1fr; }
  .kpi-grid { grid-template-columns: repeat(2, minmax(0,1fr)); }
}

@media (max-width: 900px){
  .admin-shell { overflow-x: hidden; }
  .topbar {
    margin: 8px 10px 0;
    height: auto;
    grid-template-columns: 1fr auto;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 16px;
  }
  .sub,
  .user-name,
  .status-pill { display: none; }
  .global-search {
    grid-column: 1 / -1;
    grid-row: 2;
    height: 42px;
  }
  .icon-btn {
    width: 42px;
    height: 42px;
  }
  .layout {
    display: block;
    padding: 8px 12px calc(92px + env(safe-area-inset-bottom, 0px));
  }
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
  .collapse-btn { display: none; }
  .menu {
    display: flex;
    gap: 4px;
    min-width: 0;
    width: 100%;
    justify-content: space-between;
  }
  .menu-item {
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
  .menu-item.mobile-secondary { display: none; }
  .menu-item::before { display: none; }
  .nav-label.long { display: none !important; }
  .nav-label.short {
    display: block;
    font-size: 10px;
    font-weight: 600;
    line-height: 1.1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
  .menu-item .mi { font-size: 1.1rem; line-height: 1; }
  .kpi-grid,
  .margin-summary {
    grid-template-columns: 1fr 1fr;
  }
  .hero { padding: 14px; }
  .hero h1 { font-size: 1.2rem; }
  .section-head,
  .table-tools,
  .controls {
    flex-wrap: wrap;
    gap: 8px;
  }
  .child-view {
    padding: 8px 0;
    max-width: 100%;
    overflow-x: hidden;
  }
  .table-wrap {
    width: 100%;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  .table-wrap .table,
  .table {
    min-width: 520px;
  }
  .child-view :deep(.table-wrap) {
    width: 100%;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  .child-view :deep(table),
  .child-view :deep(.table) {
    min-width: 520px;
  }
  .child-view :deep(.toolbar),
  .child-view :deep(.filters),
  .child-view :deep(.head) {
    flex-wrap: wrap;
  }
  .card-head .controls {
    width: 100%;
  }
  .card-head .controls .field {
    flex: 1 1 120px;
    min-width: 0;
  }
}

@media (max-width: 420px){
  .topbar { margin-left: 8px; margin-right: 8px; }
  .layout { padding-left: 8px; padding-right: 8px; }
  .sidebar { left: 8px; right: 8px; }
  .kpi-grid,
  .margin-summary { grid-template-columns: 1fr; }
  .nav-label.short { font-size: 9px; }
}
</style>
