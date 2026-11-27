<template>
  <div class="page">
    <h2>My Orders</h2>
    <table class="table">
      <thead><tr><th>#</th><th>Store</th><th>Status</th><th>Items</th><th>Total</th><th>Placed</th></tr></thead>
      <tbody>
        <tr v-for="o in orders" :key="o.id">
          <td>#{{ o.id }}</td>
          <td>{{ o.store_name }}</td>
          <td>{{ o.status }}</td>
          <td>{{ o.items_count }}</td>
          <td>₱{{ fmt(o.total_amount) }}</td>
          <td>{{ new Date(o.created_at).toLocaleString() }}</td>
        </tr>
        <tr v-if="orders.length===0"><td colspan="6" class="empty">No orders</td></tr>
      </tbody>
    </table>
  </div>
</template>
<script>
import api from '../services/api'
export default{ name:'CustomerOrders', data(){return{orders:[]}}, async created(){ const {data}=await api.get('/customer/orders'); this.orders=data }, methods:{ fmt(v){ const n=Number(v); return isFinite(n)?n.toFixed(2):'0.00' } } }
</script>
<style scoped>
.page{padding:20px}
.table{width:100%;background:#fff;border-collapse:collapse;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06)}
.table th,.table td{padding:10px 12px;border-bottom:1px solid #eee}
.table th{background:#fafafa;text-align:left}
.empty{text-align:center;color:#999}
</style>
