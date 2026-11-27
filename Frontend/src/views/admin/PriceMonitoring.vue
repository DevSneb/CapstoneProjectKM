<template>
  <div class="price-page">
    <div class="head">
      <h2>Price Monitoring</h2>
      <div class="controls">
        <label>Store
          <select v-model="storeOwnerId" @change="fetch">
            <option value="">All Stores</option>
            <option v-for="s in stores" :key="s.id" :value="s.id">{{ s.store_name }}</option>
          </select>
        </label>
        <label>Margin
          <select v-model="marginFilter">
            <option value="">All</option>
            <option value="healthy">Healthy</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
        <label>Search
          <input v-model="q" @input="debouncedFetch" placeholder="Product / category" />
        </label>
        <button class="secondary" @click="exportCSV">Export CSV</button>
      </div>
    </div>

    <div class="summary">
      <article class="sum-card">
        <span>Healthy Margin</span>
        <strong>{{ summary.healthy }}</strong>
      </article>
      <article class="sum-card">
        <span>Medium Margin</span>
        <strong>{{ summary.medium }}</strong>
      </article>
      <article class="sum-card">
        <span>Low Margin</span>
        <strong>{{ summary.low }}</strong>
      </article>
    </div>

    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>Store</th>
            <th>Product</th>
            <th>Category</th>
            <th>Selling Price</th>
            <th>Buying Price</th>
            <th>Margin</th>
            <th>Price Change</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in filteredRows" :key="p.id">
            <td>{{ p.store_name }}</td>
            <td>{{ p.name }}</td>
            <td>{{ p.category || '—' }}</td>
            <td>₱{{ Number(p.price || 0).toFixed(2) }}</td>
            <td>₱{{ Number(p.cost || 0).toFixed(2) }}</td>
            <td><span class="badge" :class="marginClass(p)">{{ marginPct(p).toFixed(1) }}%</span></td>
            <td :class="priceDelta(p)>=0 ? 'up':'down'">{{ priceDelta(p)>=0 ? '↑':'↓' }} {{ Math.abs(priceDelta(p)).toFixed(2) }}</td>
            <td><span class="time">{{ new Date(p.updated_at).toLocaleString() }}</span></td>
          </tr>
          <tr v-if="filteredRows.length===0"><td colspan="8" class="empty">No products found</td></tr>
        </tbody>
      </table>
    </div>

    <div class="pagination">
      <button @click="prev" :disabled="page<=1">Prev</button>
      <span>Page {{ page }} of {{ totalPages }}</span>
      <button @click="next" :disabled="page>=totalPages">Next</button>
    </div>
  </div>
</template>

<script>
import api from '../../services/api'
const debounce = (fn, d = 400) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), d) } }

export default {
  name: 'AdminPriceMonitoring',
  data(){
    return {
      stores: [],
      rows: [],
      storeOwnerId: '',
      marginFilter: '',
      q: '',
      page: 1,
      pageSize: 20,
      total: 0,
      debouncedFetch: null
    }
  },
  computed:{
    totalPages(){ return Math.max(1, Math.ceil(this.total / this.pageSize)) },
    filteredRows(){
      let rows = [...this.rows]
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
    summary(){
      return {
        healthy: this.rows.filter(r=>this.marginPct(r)>=25).length,
        medium: this.rows.filter(r=>this.marginPct(r)>=10 && this.marginPct(r)<25).length,
        low: this.rows.filter(r=>this.marginPct(r)<10).length
      }
    }
  },
  async created(){
    this.debouncedFetch = debounce(this.fetch, 400)
    await this.loadStores()
    await this.fetch()
  },
  methods:{
    async loadStores(){
      const { data } = await api.get('/admin/stores')
      this.stores = data || []
    },
    async fetch(){
      const params = { page: this.page, pageSize: this.pageSize }
      if(this.storeOwnerId) params.storeOwnerId = this.storeOwnerId
      if(this.q) params.q = this.q
      const { data } = await api.get('/admin/price-monitoring', { params })
      this.rows = data.rows || []
      this.total = data.total || 0
      this.page = data.page || this.page
      this.pageSize = data.pageSize || this.pageSize
    },
    prev(){ if(this.page>1){ this.page--; this.fetch() } },
    next(){ if(this.page<this.totalPages){ this.page++; this.fetch() } },
    marginPct(p){
      const price = Number(p.price || 0)
      const cost = Number(p.cost || 0)
      if(price<=0) return 0
      return ((price-cost)/price)*100
    },
    marginClass(p){
      const m = this.marginPct(p)
      if(m >= 25) return 'healthy'
      if(m >= 10) return 'medium'
      return 'low'
    },
    priceDelta(p){
      return Number(p.price || 0) - Number(p.cost || 0)
    },
    exportCSV(){
      const head = ['Store','Product','Category','Selling Price','Buying Price','Margin','Price Change','Updated']
      const rows = this.filteredRows.map(p=>[
        p.store_name,
        p.name,
        p.category || '',
        Number(p.price||0).toFixed(2),
        Number(p.cost||0).toFixed(2),
        this.marginPct(p).toFixed(2) + '%',
        this.priceDelta(p).toFixed(2),
        new Date(p.updated_at).toLocaleString()
      ])
      const csv = [head.join(','), ...rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'"')}"`).join(','))].join('\n')
      const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'admin_price_monitoring.csv'
      a.click()
      URL.revokeObjectURL(url)
    }
  }
}
</script>

<style scoped>
.price-page{display:grid;gap:12px}
.head{display:flex;justify-content:space-between;align-items:flex-end;gap:10px}
.controls{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end}
label{display:grid;gap:4px;font-size:12px;color:#5f7256}
input,select{min-height:36px;border:1px solid #cddbb9;border-radius:10px;padding:0 10px;background:#fff}
.secondary{border:1px solid #cddbb9;background:#fff;color:#2f5a23;border-radius:10px;min-height:36px;padding:0 12px;cursor:pointer}
.summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.sum-card{background:#fff;border:1px solid #deead0;border-radius:14px;padding:10px 12px;box-shadow:0 10px 24px rgba(56,92,35,.1);display:flex;justify-content:space-between;align-items:center}
.sum-card span{font-size:12px;color:#5f7256}
.sum-card strong{font-size:1.1rem}
.table-wrap{max-height:480px;overflow:auto;border:1px solid #deead0;border-radius:14px;background:#fff;box-shadow:0 10px 24px rgba(56,92,35,.1)}
.table{width:100%;border-collapse:collapse}
.table thead th{position:sticky;top:0;background:#f4f8ee;z-index:2}
.table th,.table td{padding:10px 12px;border-bottom:1px solid #e6eddc;text-align:left;font-size:13px}
.inline{width:86px;min-height:32px;border:1px solid #cddbb9;border-radius:8px;padding:0 8px}
.badge{display:inline-block;border-radius:999px;padding:4px 8px;font-size:12px;font-weight:700}
.badge.healthy{background:rgba(34,197,94,.18);color:#166534}
.badge.medium{background:rgba(234,179,8,.2);color:#854d0e}
.badge.low{background:rgba(239,68,68,.2);color:#991b1b}
.up{color:#16a34a}
.down{color:#dc2626}
.time{background:#edf8e3;color:#2f5a23;padding:4px 8px;border-radius:999px;font-size:12px}
.empty{text-align:center;color:#6f7d67}
.pagination{display:flex;justify-content:flex-end;gap:8px;align-items:center}
.pagination button{border:1px solid #cddbb9;background:#fff;border-radius:8px;min-height:32px;padding:0 10px;cursor:pointer}
.pagination button:disabled{opacity:.5;cursor:not-allowed}
@media (max-width:1024px){
  .summary{grid-template-columns:1fr}
  .head{flex-direction:column;align-items:flex-start}
}

/* mobile-dashboard-fix */
.table-wrap{width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch}
.table-wrap .table, table.table{width:100%}
@media (max-width: 640px){
  .toolbar,.filters,.head,.section-head,.graph-head,.forecast-tools,.reports-header,.form{flex-wrap:wrap}
  .toolbar,.filters,.head,.section-head{display:flex;gap:8px}
  .toolbar input,.search-input,input[type="search"],.search{min-width:0!important;width:100%;max-width:100%}
  .table-wrap .table, table.table{min-width:560px}
  .btn,button.primary,button.save-btn{min-height:40px}
  .barangay-row{flex-direction:column;align-items:stretch!important}
  .map{height:260px!important}
  .details-grid{grid-template-columns:1fr!important}
  .card,.form{max-width:100%}
}
</style>
