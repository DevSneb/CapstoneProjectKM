<template>
  <div>
    <h2>Home • Sales Analytics</h2>
    <div class="cards">
      <div class="card"><div class="label">Total Orders</div><div class="num">{{ analytics.totalOrders ?? 0 }}</div></div>
      <div class="card"><div class="label">Total Sales (Delivered)</div><div class="num">₱{{ Number(analytics.totalSales ?? 0).toFixed(2) }}</div></div>
      <div class="card"><div class="label">AOV (Delivered)</div><div class="num">₱{{ Number(analytics.aovDelivered ?? 0).toFixed(2) }}</div></div>
      <div class="card"><div class="label">Items Sold</div><div class="num">{{ analytics.itemsSold ?? 0 }}</div></div>
    </div>

    <div class="cards narrow">
      <div class="card"><div class="label">Pending</div><div class="num">{{ analytics.countPending ?? 0 }}</div></div>
      <div class="card"><div class="label">On The Way</div><div class="num">{{ analytics.countOnTheWay ?? 0 }}</div></div>
      <div class="card"><div class="label">Delivered</div><div class="num">{{ analytics.countDelivered ?? 0 }}</div></div>
      <div class="card"><div class="label">Rejected</div><div class="num">{{ analytics.countRejected ?? 0 }}</div></div>
    </div>

    <h3>Most Sold Products</h3>
    <div class="table-wrap"><table class="table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Sold Qty</th>
          <th>Revenue</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="p in analytics.topProducts || []" :key="p.id">
          <td>{{ p.name }}</td>
          <td>{{ p.soldQty }}</td>
          <td>₱{{ Number(p.revenue).toFixed(2) }}</td>
        </tr>
        <tr v-if="(analytics.topProducts || []).length === 0">
          <td colspan="3" class="empty">No data yet.</td>
        </tr>
      </tbody>
    </table></div>

    <h3>Revenue by Category (Delivered)</h3>
    <div class="table-wrap"><table class="table">
      <thead>
        <tr>
          <th>Category</th>
          <th>Qty</th>
          <th>Revenue</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in analytics.revenueByCategory || []" :key="r.category">
          <td>{{ r.category }}</td>
          <td>{{ r.qty }}</td>
          <td>₱{{ Number(r.revenue).toFixed(2) }}</td>
        </tr>
        <tr v-if="(analytics.revenueByCategory || []).length === 0">
          <td colspan="3" class="empty">No data yet.</td>
        </tr>
      </tbody>
    </table></div>

    <h3>Last 7 Days (Delivered)</h3>
    <div class="table-wrap"><table class="table">
      <thead>
        <tr>
          <th>Day</th>
          <th>Orders</th>
          <th>Revenue</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="d in analytics.dailyRevenue7 || []" :key="d.day">
          <td>{{ new Date(d.day).toLocaleDateString() }}</td>
          <td>{{ d.orders }}</td>
          <td>₱{{ Number(d.revenue).toFixed(2) }}</td>
        </tr>
        <tr v-if="(analytics.dailyRevenue7 || []).length === 0">
          <td colspan="3" class="empty">No data yet.</td>
        </tr>
      </tbody>
    </table></div>

    <h3>Last 6 Months (Delivered)</h3>
    <div class="table-wrap"><table class="table">
      <thead>
        <tr>
          <th>Month</th>
          <th>Orders</th>
          <th>Revenue</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="m in analytics.monthlyRevenue6 || []" :key="m.month">
          <td>{{ m.month }}</td>
          <td>{{ m.orders }}</td>
          <td>₱{{ Number(m.revenue).toFixed(2) }}</td>
        </tr>
        <tr v-if="(analytics.monthlyRevenue6 || []).length === 0">
          <td colspan="3" class="empty">No data yet.</td>
        </tr>
      </tbody>
    </table></div>
  </div>
</template>

<script>
import api from '../../services/api'

export default {
  name: 'StoreHome',
  data() {
    return { analytics: {} }
  },
  async created() {
    const { data } = await api.get('/store/analytics')
    this.analytics = data
  }
}
</script>

<style scoped>
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px,1fr)); gap: 12px; margin: 10px 0 20px; }
.cards.narrow { grid-template-columns: repeat(auto-fit, minmax(140px,1fr)); }
.card { background: #fff; padding: 16px; border-radius: 8px; box-shadow: 0 4px 14px rgba(56,92,35,.08); border-top:3px solid #7CB342; }
.label { color: #5f7256; font-size: 12px; }
.num { font-size: 28px; font-weight: 700; color: #2f5a23; }
.table { width: 100%; background: #fff; border-collapse: collapse; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 14px rgba(56,92,35,.08); }
.table th, .table td { padding: 10px 12px; border-bottom: 1px solid #e6eddc; }
.table th{ background:#f4f8ee }
.empty { text-align: center; color: #6f7d67; }

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
