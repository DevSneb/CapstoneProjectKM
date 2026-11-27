<template>
  <div class="stores-page">
    <div class="head">
      <h2>Stores Management</h2>
      <input v-model="q" class="search" placeholder="Search store, owner, email" />
    </div>

    <div class="table-wrap">
    <table class="table">
      <thead>
        <tr>
          <th>Store Name</th>
          <th>Owner</th>
          <th>Email</th>
          <th>Phone</th>
          <th>Status</th>
          <th>POS Users</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="s in filteredStores" :key="s.id">
          <td>{{ s.store_name }}</td>
          <td>{{ s.full_name }}</td>
          <td>{{ s.email }}</td>
          <td>{{ s.phone || '—' }}</td>
          <td>{{ s.status }}</td>
          <td>{{ posUsersCountByStore[s.id] || 0 }}</td>
        </tr>
        <tr v-if="filteredStores.length===0"><td colspan="6" class="empty">No stores</td></tr>
      </tbody>
    </table>
    </div>
  </div>
</template>
<script>
import api from '../../services/api'
export default {
  name: 'AdminStores',
  data(){
    return{
      stores:[],
      q:'',
      posUsersCountByStore:{},
    }
  },
  computed:{
    filteredStores(){
      const q = String(this.q || '').toLowerCase().trim()
      if(!q) return this.stores
      return this.stores.filter(s =>
        String(s.store_name || '').toLowerCase().includes(q) ||
        String(s.full_name || '').toLowerCase().includes(q) ||
        String(s.email || '').toLowerCase().includes(q)
      )
    }
  },
  async created(){
    const {data} = await api.get('/admin/stores')
    this.stores = data
    await this.refreshPosUserCounts()
  },
  methods:{
    async refreshPosUserCounts(){
      const map = {}
      for(const s of this.stores){
        try{
          const { data } = await api.get(`/admin/stores/${s.id}/pos-users`)
          map[s.id] = Array.isArray(data) ? data.length : 0
        }catch(_){
          map[s.id] = 0
        }
      }
      this.posUsersCountByStore = map
    }
  }
}
</script>
<style scoped>
.stores-page{display:grid;gap:12px}
.head{display:flex;justify-content:space-between;align-items:center;gap:10px}
.head h2{margin:0}
.search{min-height:36px;border:1px solid #cddbb9;border-radius:10px;padding:0 10px;background:#fff;min-width:0;width:100%;max-width:100%}
.table-wrap{max-height:520px;overflow:auto;border-radius:14px;border:1px solid #deead0;background:#fff;box-shadow:0 10px 24px rgba(56,92,35,.1)}
.table{width:100%;border-collapse:collapse}
.table thead th{position:sticky;top:0;background:#f4f8ee;z-index:2}
.table th,.table td{padding:10px 12px;border-bottom:1px solid #e6eddc;text-align:left}
.table tbody tr:hover{background:rgba(124,179,66,.1)}
.empty{text-align:center;color:#6f7d67}
.btn{padding:6px 10px;border:1px solid #cddbb9;background:#f8fbf4;border-radius:6px;cursor:pointer}
.modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:50}
.modal{position:fixed;z-index:60;inset:50% auto auto 50%;transform:translate(-50%,-50%);width:min(860px,calc(100vw - 24px));max-height:80vh;overflow:auto;background:#fff;border-radius:12px;padding:12px;box-shadow:0 12px 34px rgba(0,0,0,.25)}
.create-form{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-bottom:10px}
.create-form input{border:1px solid #cddbb9;border-radius:8px;padding:8px 10px;background:#fff}
.modal-actions{display:flex;justify-content:flex-end;margin-top:10px}
@media (max-width: 900px){.create-form{grid-template-columns:1fr}}

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
