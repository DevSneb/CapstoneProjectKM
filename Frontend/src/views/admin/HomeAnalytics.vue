<template>
  <div>
    <h2>Store Analytics</h2>
    <div class="cards">
      <div class="card"><div class="title">Stores</div><div class="value">{{ stats.stores }}</div></div>
      <div class="card"><div class="title">Customers</div><div class="value">{{ stats.customers }}</div></div>
      <div class="card"><div class="title">Orders</div><div class="value">{{ stats.orders }}</div></div>
      <div class="card"><div class="title">Products</div><div class="value">{{ stats.products }}</div></div>
      <div class="card"><div class="title">Sales Total (Delivered)</div><div class="value">₱{{ to2(stats.sales_total) }}</div></div>
    </div>

    <h3 class="section-title">Order Status & KPIs</h3>
    <div class="cards">
      <div class="card"><div class="title">Pending</div><div class="value">{{ detailed.countPending }}</div></div>
      <div class="card"><div class="title">On The Way</div><div class="value">{{ detailed.countOnTheWay }}</div></div>
      <div class="card"><div class="title">Delivered</div><div class="value">{{ detailed.countDelivered }}</div></div>
      <div class="card"><div class="title">Rejected</div><div class="value">{{ detailed.countRejected }}</div></div>
      <div class="card"><div class="title">AOV (Delivered)</div><div class="value">₱{{ to2(detailed.aovDelivered) }}</div></div>
      <div class="card"><div class="title">Items Sold</div><div class="value">{{ detailed.itemsSold }}</div></div>
    </div>

    <div class="grid">
      <div class="panel">
        <div class="panel-title">Revenue by Category</div>
        <table class="table">
          <thead><tr><th>Category</th><th>Revenue</th><th>Qty</th></tr></thead>
          <tbody>
            <tr v-for="c in detailed.revenueByCategory" :key="c.category">
              <td>{{ c.category }}</td>
              <td>₱{{ to2(c.revenue) }}</td>
              <td>{{ c.qty }}</td>
            </tr>
            <tr v-if="!detailed.revenueByCategory.length"><td colspan="3" class="empty">No data</td></tr>
          </tbody>
        </table>
      </div>
      <div class="panel">
        <div class="panel-title">Top Products</div>
        <table class="table">
          <thead><tr><th>Product</th><th>Sold Qty</th><th>Revenue</th></tr></thead>
          <tbody>
            <tr v-for="p in detailed.topProducts" :key="p.id">
              <td>{{ p.name }}</td>
              <td>{{ p.soldQty }}</td>
              <td>₱{{ to2(p.revenue) }}</td>
            </tr>
            <tr v-if="!detailed.topProducts.length"><td colspan="3" class="empty">No data</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="grid">
      <div class="panel">
        <div class="panel-title">Last 7 Days (Delivered)</div>
        <table class="table">
          <thead><tr><th>Date</th><th>Revenue</th><th>Orders</th></tr></thead>
          <tbody>
            <tr v-for="d in detailed.dailyRevenue7" :key="d.day">
              <td>{{ d.day }}</td>
              <td>₱{{ to2(d.revenue) }}</td>
              <td>{{ d.orders }}</td>
            </tr>
            <tr v-if="!detailed.dailyRevenue7.length"><td colspan="3" class="empty">No data</td></tr>
          </tbody>
        </table>
      </div>
      <div class="panel">
        <div class="panel-title">Last 6 Months (Delivered)</div>
        <table class="table">
          <thead><tr><th>Month</th><th>Revenue</th><th>Orders</th></tr></thead>
          <tbody>
            <tr v-for="m in detailed.monthlyRevenue6" :key="m.month">
              <td>{{ m.month }}</td>
              <td>₱{{ to2(m.revenue) }}</td>
              <td>{{ m.orders }}</td>
            </tr>
            <tr v-if="!detailed.monthlyRevenue6.length"><td colspan="3" class="empty">No data</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <h3 class="section-title">Store Announcements</h3>
    <div class="grid">
      <div class="panel">
        <div class="panel-title">Create Announcement</div>
        <form class="announce-form" @submit.prevent="publishAnnouncement">
          <label>
            Title
            <input v-model="announcementForm.title" type="text" maxlength="150" required placeholder="Announcement title" />
          </label>
          <label>
            Target
            <select v-model="announcementForm.target_scope">
              <option value="all">All Stores</option>
              <option value="store">Specific Store</option>
            </select>
          </label>
          <label v-if="announcementForm.target_scope==='store'">
            Store
            <select v-model.number="announcementForm.target_store_id" required>
              <option :value="null">Select store</option>
              <option v-for="s in stores" :key="s.id" :value="s.id">{{ s.store_name }}</option>
            </select>
          </label>
          <label class="full">
            Message
            <textarea v-model="announcementForm.message" rows="4" required placeholder="Write announcement message"></textarea>
          </label>
          <div class="actions">
            <button class="primary" :disabled="publishingAnnouncement">
              {{ publishingAnnouncement ? 'Publishing...' : 'Publish Announcement' }}
            </button>
          </div>
        </form>
      </div>

      <div class="panel">
        <div class="panel-title">Recent Announcements</div>
        <table class="table">
          <thead><tr><th>Title</th><th>Target</th><th>Message</th><th>Date</th></tr></thead>
          <tbody>
            <tr v-for="a in announcements" :key="a.id">
              <td>{{ a.title }}</td>
              <td>{{ a.target_scope==='all' ? 'All Stores' : (a.target_store_name || ('Store #' + a.target_store_id)) }}</td>
              <td>{{ a.message }}</td>
              <td>{{ new Date(a.created_at).toLocaleString() }}</td>
            </tr>
            <tr v-if="!announcements.length"><td colspan="4" class="empty">No announcements yet</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
<script>
import api from '../../services/api'
export default {
  name: 'AdminHomeAnalytics',
  data(){return{
    stats:{stores:0,customers:0,orders:0,products:0,sales_total:0},
    detailed:{
      countPending:0,countOnTheWay:0,countDelivered:0,countRejected:0,
      aovDelivered:0,itemsSold:0,
      revenueByCategory:[],topProducts:[],dailyRevenue7:[],monthlyRevenue6:[]
    },
    stores: [],
    announcements: [],
    publishingAnnouncement: false,
    announcementForm: {
      title: '',
      target_scope: 'all',
      target_store_id: null,
      message: ''
    }
  }},
  async created(){
    const [a,d,s,ann] = await Promise.all([
      api.get('/admin/dashboard/analytics'),
      api.get('/admin/dashboard/analytics/detailed'),
      api.get('/admin/stores'),
      api.get('/admin/announcements')
    ])
    this.stats = a.data
    this.detailed = d.data
    this.stores = s.data || []
    this.announcements = ann.data || []
  },
  methods:{
    to2(v){ return Number(v||0).toFixed(2) },
    async publishAnnouncement(){
      if(!this.announcementForm.title || !this.announcementForm.message) return
      if(this.announcementForm.target_scope === 'store' && !this.announcementForm.target_store_id){
        alert('Please select a target store')
        return
      }

      this.publishingAnnouncement = true
      try{
        await api.post('/admin/announcements', {
          title: this.announcementForm.title,
          message: this.announcementForm.message,
          target_scope: this.announcementForm.target_scope,
          target_store_id: this.announcementForm.target_scope === 'store' ? this.announcementForm.target_store_id : null
        })
        this.announcementForm = {
          title: '',
          target_scope: 'all',
          target_store_id: null,
          message: ''
        }
        const { data } = await api.get('/admin/announcements')
        this.announcements = data || []
      }catch(err){
        alert(err.response?.data?.message || 'Failed to publish announcement')
      }finally{
        this.publishingAnnouncement = false
      }
    }
  }
}
</script>
<style scoped>
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:12px}
.card{background:#fff;border-radius:8px;padding:16px;box-shadow:0 4px 14px rgba(56,92,35,.08);border-top:3px solid #7CB342}
.title{color:#5f7256}
.value{font-weight:700;font-size:22px;color:#2f5a23}
.section-title{margin-top:18px;color:#2f5a23}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;margin-top:12px}
.panel{background:#fff;border-radius:8px;padding:12px;box-shadow:0 4px 14px rgba(56,92,35,.08)}
.panel-title{font-weight:600;margin-bottom:8px;color:#2f5a23}
.table{width:100%;border-collapse:collapse}
.table th,.table td{padding:8px 10px;border-bottom:1px solid #e6eddc}
.table th{background:#f4f8ee}
.empty{text-align:center;color:#6f7d67}
.announce-form{display:grid;grid-template-columns:1fr 220px;gap:10px}
.announce-form label{display:grid;gap:4px;font-size:13px;color:#5f6f53}
.announce-form label.full{grid-column:1 / -1}
.announce-form input,.announce-form select,.announce-form textarea{border:1px solid #cddbb9;border-radius:8px;padding:8px 10px;background:#fff}
.announce-form textarea{resize:vertical}
.announce-form .actions{grid-column:1 / -1;display:flex;justify-content:flex-end}
.primary{background:linear-gradient(135deg,#7CB342,#4E7D32);color:#fff;border:none;padding:8px 12px;border-radius:8px;cursor:pointer}
.primary:disabled{opacity:.6;cursor:not-allowed}
@media (max-width: 900px){
  .announce-form{grid-template-columns:1fr}
}
</style>
