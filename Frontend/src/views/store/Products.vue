<template>
  <div>
    <h2>Products • List</h2>

    <div class="toolbar">
      <input v-model="q" @input="debouncedFetch" placeholder="Search product name or description..." aria-label="Search product name or description" />
    </div>

    <div class="pager">
      <div class="left">Showing {{ paginated.length }} of {{ sorted.length }} items</div>
      <div class="right">
        <label>Per page
          <select v-model.number="pageSize">
            <option :value="10">10</option>
            <option :value="25">25</option>
            <option :value="50">50</option>
            <option :value="100">100</option>
          </select>
        </label>
        <button class="btn" :disabled="page===1" @click="prevPage">Prev</button>
        <span class="page">Page {{ page }} / {{ totalPages }}</span>
        <button class="btn" :disabled="page===totalPages" @click="nextPage">Next</button>
      </div>
    </div>

    <div class="table-wrap"><table class="table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Description</th>
          <th>Price</th>
          <th>Stock</th>
          <th>Status</th>
          <th>Last Changed</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="p in paginated" :key="p.id">
          <td>{{ p.name }}</td>
          <td class="desc">{{ p.description || '—' }}</td>
          <td>₱{{ Number(p.price).toFixed(2) }}</td>
          <td>{{ Number(p.stock || 0) }}</td>
          <td>{{ p.status }}</td>
          <td>{{ formatDateTime(p.updated_at) }}</td>
        </tr>
        <tr v-if="sorted.length === 0">
          <td colspan="6" class="empty">No products</td>
        </tr>
      </tbody>
    </table></div>
  </div>
</template>

<script>
import api from '../../services/api'

function debounce(fn, delay=400) { let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), delay);} }

export default {
  name: 'StoreProducts',
  data() {
    return { q: '', items: [], page: 1, pageSize: 25 }
  },
  created() {
    this.fetch();
    this.debouncedFetch = debounce(this.fetch, 400);
  },
  computed: {
    sorted() {
      return [...this.items].sort((a,b)=> String(a.name||'').localeCompare(String(b.name||'')))
    },
    totalPages(){
      return Math.max(1, Math.ceil(this.sorted.length / this.pageSize))
    },
    paginated(){
      const start = (this.page - 1) * this.pageSize
      return this.sorted.slice(start, start + this.pageSize)
    }
  },
  watch: {
    pageSize(){ this.page = 1 }
  },
  methods: {
    async fetch() {
      const { data } = await api.get('/store/products', { params: { q: this.q || undefined } })
      this.items = data
    },
    prevPage(){ if(this.page>1) this.page-- },
    nextPage(){ if(this.page<this.totalPages) this.page++ },
    formatDateTime(value) {
      if (!value) return '—'
      const parsed = new Date(value)
      if (Number.isNaN(parsed.getTime())) return '—'
      return parsed.toLocaleString()
    }
  }
}
</script>

<style scoped>
.toolbar { display:flex; gap:8px; margin-bottom:12px; }
.table { width:100%; border-collapse:collapse; background:#fff; border-radius:8px; overflow:hidden; box-shadow:0 4px 14px rgba(56,92,35,.08);} 
.table th,.table td{ padding:10px 12px; border-bottom:1px solid #e6eddc; }
.table th{ background:#f4f8ee; text-align:left }
.desc{ color:#48603b; max-width:420px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis }
.pager{ display:flex; justify-content:space-between; align-items:center; margin: 10px 0 }
.pager .right{ display:flex; gap:8px; align-items:center }
.btn{ padding:6px 10px; border:1px solid #cddbb9; background:#f8fbf4; border-radius:6px; cursor:pointer }
.btn:disabled{ opacity:.5; cursor:not-allowed }
.page{ min-width:120px; text-align:center; display:inline-block }
.empty { text-align:center; color:#6f7d67; }
input{ border:1px solid #cddbb9; border-radius:6px; padding:8px; background:#fff }

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
