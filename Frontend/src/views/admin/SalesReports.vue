<template>
  <div class="reports-page">
    <div class="head">
      <h2>Sales Reports</h2>
      <div class="filters">
        <label>From <input type="date" v-model="from"/></label>
        <label>To <input type="date" v-model="to"/></label>
        <button @click="fetch">Load</button>
      </div>
    </div>

    <div class="table-wrap">
    <table class="table">
      <thead><tr><th>Date</th><th>Total</th></tr></thead>
      <tbody>
        <tr v-for="r in rows" :key="r.date">
          <td>{{ r.date }}</td>
          <td>₱{{ Number(r.total).toFixed(2) }}</td>
        </tr>
        <tr v-if="rows.length===0"><td colspan="2" class="empty">No data</td></tr>
      </tbody>
    </table>
    </div>

    <div class="head second">
      <h3>Store Submissions</h3>
      <div class="filters">
        <label>Store ID <input type="number" v-model.number="storeFilter"/></label>
        <label>Period
          <select v-model="periodFilter">
            <option value="">All</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </label>
        <button @click="fetchSubmissions">Load</button>
      </div>
    </div>

    <div class="table-wrap">
    <table class="table">
      <thead><tr><th>Store</th><th>Period</th><th>Start</th><th>End</th><th>Orders</th><th>Items</th><th>Revenue</th><th>Submitted</th><th>File</th></tr></thead>
      <tbody>
        <tr v-for="r in submissions" :key="r.id">
          <td>{{ r.store_name }}</td>
          <td>{{ r.period_type }}</td>
          <td>{{ r.period_start }}</td>
          <td>{{ r.period_end }}</td>
          <td>{{ r.orders_count }}</td>
          <td>{{ r.items_sold }}</td>
          <td>₱{{ Number(r.total_revenue).toFixed(2) }}</td>
          <td>{{ new Date(r.created_at).toLocaleString() }}</td>
          <td>
            <button v-if="r.report_file_path" class="download" @click="downloadFile(r)">Download Report</button>
            <span v-else class="muted">—</span>
          </td>
        </tr>
        <tr v-if="submissions.length===0"><td colspan="9" class="empty">No submissions found</td></tr>
      </tbody>
    </table>
    </div>
  </div>
</template>
<script>
import api from '../../services/api'
export default {
  name: 'AdminSalesReports',
  data(){return{from:'',to:'',rows:[], submissions:[], storeFilter:'', periodFilter:''}},
  created(){this.fetch(); this.fetchSubmissions()},
  methods:{
    async fetch(){
      const {data} = await api.get('/admin/reports/sales',{params:{from:this.from||undefined,to:this.to||undefined}})
      this.rows = data
    },
    async fetchSubmissions(){
      const params = {}
      if(this.storeFilter) params.storeOwnerId = this.storeFilter
      if(this.periodFilter) params.period = this.periodFilter
      const {data} = await api.get('/admin/reports/submissions',{params})
      this.submissions = data
    },
    async downloadFile(r){
      try{
        const res = await api.get(`/admin/reports/submissions/${r.id}/file`, { responseType: 'blob' })
        let filename = r.report_file_name || `submission_${r.id}.pdf`
        const disposition = res.headers?.['content-disposition'] || ''
        const m = disposition.match(/filename="?([^";]+)"?/i)
        if(m && m[1]) filename = m[1]

        const mimeType = res.headers?.['content-type'] || 'application/octet-stream'
        const blob = new Blob([res.data], { type: mimeType })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
        URL.revokeObjectURL(url)
      }catch(err){
        alert(err.response?.data?.message || 'Failed to download file')
      }
    }
  }
}
</script>
<style scoped>
.reports-page{display:grid;gap:12px}
.head{display:flex;justify-content:space-between;align-items:flex-end;gap:10px}
.head h2,.head h3{margin:0}
.head.second{margin-top:8px}
.filters{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end}
label{display:grid;gap:4px;font-size:12px;color:#5f7256}
input,select{min-height:36px;border:1px solid #cddbb9;border-radius:10px;padding:0 10px;background:#fff}
button{min-height:36px;border:none;border-radius:10px;padding:0 12px;color:#fff;cursor:pointer;background:linear-gradient(135deg,#7CB342,#4E7D32)}
.table-wrap{max-height:360px;overflow:auto;border-radius:14px;border:1px solid #deead0;background:#fff;box-shadow:0 10px 24px rgba(56,92,35,.1)}
.table{width:100%;border-collapse:collapse}
.table thead th{position:sticky;top:0;background:#f4f8ee;z-index:2}
.table th,.table td{padding:10px 12px;border-bottom:1px solid #e6eddc;text-align:left}
.table tbody tr:hover{background:rgba(124,179,66,.1)}
.empty{text-align:center;color:#6f7d67}
.download{min-height:32px;border:none;border-radius:8px;padding:0 10px;background:linear-gradient(135deg,#7CB342,#4E7D32);color:#fff;cursor:pointer}
.muted{color:#6f7d67}

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
