<template>
  <div>
    <h2>Notifications</h2>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Type</th><th>Message</th><th>Date</th><th>Actions</th></tr></thead>
      <tbody>
        <tr v-for="n in rows" :key="n.id">
          <td>
            <span class="type-pill" :class="n.type === 'announcement' ? 'announcement' : 'default'">
              {{ n.type === 'announcement' ? 'Announcement' : n.type }}
            </span>
          </td>
          <td :class="{ read: n.is_read }">{{ n.message }}</td>
          <td>{{ new Date(n.created_at).toLocaleString() }}</td>
          <td>
            <button v-if="!n.is_read" @click="mark(n)">Mark Read</button>
          </td>
        </tr>
        <tr v-if="rows.length===0"><td colspan="4" class="empty">No notifications</td></tr>
      </tbody>
    </table></div>
  </div>
</template>
<script>
import api from '../../services/api'
export default {
  name: 'StoreNotifications',
  data(){return{rows:[]}},
  async created(){ const {data}=await api.get('/store/notifications'); this.rows=data },
  methods:{ async mark(n){ await api.post(`/store/notifications/${n.id}/read`); n.is_read=1; } }
}
</script>
<style scoped>
.table{width:100%;background:#fff;border-collapse:collapse;border-radius:8px;overflow:hidden;box-shadow:0 4px 14px rgba(56,92,35,.08)}
.table th,.table td{padding:10px 12px;border-bottom:1px solid #e6eddc}
.table th{background:#f4f8ee}
.read{opacity:.7}
.empty{text-align:center;color:#6f7d67}
.type-pill{display:inline-block;padding:3px 8px;border-radius:999px;font-size:12px}
.type-pill.announcement{background:#e9f5db;color:#2f5a23}
.type-pill.default{background:#f2f4ef;color:#4e5a46}
button{background:linear-gradient(135deg,#7CB342,#4E7D32);color:#fff;border:none;padding:7px 10px;border-radius:6px;cursor:pointer}

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
