<template>
  <div>
    <div class="toolbar">
      <input v-model="q" @input="debouncedFetch" placeholder="Search by ID or product..." />
    </div>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>ID</th><th>Status</th><th>Items</th><th>Total</th><th>Date</th><th>Details</th><th v-if="canUpdate">Update</th></tr></thead>
      <tbody>
        <tr v-for="o in rows" :key="o.id">
          <td>#{{ o.id }}</td>
          <td>{{ statusLabel(o) }}</td>
          <td>{{ o.items_count }}</td>
          <td>₱{{ Number(o.total_amount).toFixed(2) }}</td>
          <td>{{ new Date(o.created_at).toLocaleString() }}</td>
            <td><button @click="openDetails(o)" class="link">View</button></td>
            <td v-if="canUpdate">
              <select v-model="updates[o.id]">
                <option value="pending">Pending</option>
                <option value="on_the_way">On The Way</option>
                <option value="delivered">Delivered</option>
                <option value="pickup">Pickup</option>
                <option value="rejected">Rejected</option>
              </select>
              <button @click="apply(o.id)" class="link">Save</button>
            </td>
        </tr>
        <tr v-if="rows.length===0"><td :colspan="canUpdate ? 7 : 6" class="empty">No orders</td></tr>
      </tbody>
    </table></div>

    <Teleport to="body">
      <div v-if="showDetails" class="order-details-overlay">
        <div class="modal-backdrop" @click="closeDetails"></div>
        <div class="modal" role="dialog" aria-modal="true" aria-label="Order details">
          <div class="modal-header">
            <h3>Order #{{ selectedOrder?.id }} Details</h3>
            <span class="status-badge" :class="`status-${statusLabel(selectedOrder)?.toLowerCase().replace(/\s+/g, '-')}`">
              {{ statusLabel(selectedOrder) }}
            </span>
          </div>

          <div class="details-grid">
            <div class="detail-section">
              <h4>Customer Information</h4>
              <p><strong>Name:</strong> {{ selectedOrder?.customer_name || 'N/A' }}</p>
              <p><strong>Customer ID:</strong> #{{ selectedOrder?.customer_id || 'N/A' }}</p>
            </div>

            <div class="detail-section">
              <h4>Order Timeline</h4>
              <p><strong>Order Date:</strong> {{ formatDateTime(selectedOrder?.created_at) }}</p>
              <p><strong>Status:</strong> {{ statusLabel(selectedOrder) }}</p>
            </div>

            <div class="detail-section">
              <h4>Shipping Details</h4>
              <p><strong>Method:</strong> {{ capitalizeWords(selectedOrder?.shipping_method || 'pickup') }}</p>
              <p v-if="selectedOrder?.shipping_method?.toLowerCase() === 'delivery'">
                <strong>Preferred Delivery Date:</strong>
                {{ selectedOrder?.preferred_delivery_date ? formatDate(selectedOrder.preferred_delivery_date) : 'Not set' }}
              </p>
              <p v-if="selectedOrder?.delivery_address" class="full-width">
                <strong>Delivery Address:</strong><br/>
                {{ selectedOrder.delivery_address }}
              </p>
            </div>

            <div class="detail-section">
              <h4>Payment Information</h4>
              <p><strong>Method:</strong> {{ formatPaymentMethod(selectedOrder?.payment_method) }}</p>
            </div>
          </div>

          <div class="items-section">
            <h4>Order Items</h4>
            <div class="table-wrap"><table class="table">
              <thead><tr><th>Product</th><th>Qty</th><th>Unit Price</th><th>Subtotal</th></tr></thead>
              <tbody>
                <tr v-if="loadingDetails"><td colspan="4" class="empty">Loading items...</td></tr>
                <tr v-else v-for="it in selectedItems" :key="it.id">
                  <td>{{ it.product_name || ('Product #' + it.product_id) }}</td>
                  <td class="qty">
                    <input v-if="canEditQuantities" type="number" min="0.001" step="0.001" v-model.number="it.quantity" />
                    <span v-else>{{ it.quantity }}</span>
                  </td>
                  <td class="price">₱{{ Number(it.unit_price).toFixed(2) }}</td>
                  <td class="price">₱{{ Number(it.subtotal).toFixed(2) }}</td>
                </tr>
                <tr v-if="!loadingDetails && !selectedItems.length"><td colspan="4" class="empty">No items found</td></tr>
              </tbody>
            </table></div>
          </div>

          <div class="order-summary">
            <div class="summary-row">
              <span>Subtotal:</span>
              <span>₱{{ calculateSubtotal().toFixed(2) }}</span>
            </div>
            <div class="summary-row" v-if="selectedOrder?.delivery_fee">
              <span>Delivery Fee:</span>
              <span>₱{{ Number(selectedOrder.delivery_fee).toFixed(2) }}</span>
            </div>
            <div class="summary-row total">
              <span>Total Amount:</span>
              <span>₱{{ Number(selectedOrder?.total_amount || 0).toFixed(2) }}</span>
            </div>
          </div>

          <div class="actions">
            <button v-if="canEditQuantities" @click="saveQuantities" class="save-btn">Save Actual Quantities</button>
            <button @click="closeDetails" class="close-btn">Close</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
<script>
import api from '../../services/api'
const debounce=(fn,d=400)=>{let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),d)}}
export default {
    props:{ status:String, editable:{ type:Boolean, default:false } },
    data(){return{rows:[],q:'',updates:{},showDetails:false,loadingDetails:false,selectedOrder:null,selectedItems:[]}},
  computed:{
    canEditQuantities(){
      return this.editable && this.selectedOrder && !['delivered', 'rejected'].includes(String(this.selectedOrder.status))
    },
    canUpdate(){ return this.editable===true }
  },
  created(){ this.fetch(); this.debouncedFetch=debounce(this.fetch,400) },
  methods:{
      async fetch(){ const {data}=await api.get('/store/orders',{params:{status:this.status||undefined,q:this.q||undefined}}); this.rows=data; this.updates=Object.fromEntries(this.rows.map(r=>[r.id,this.editableStatus(r)])); },
      async apply(id){ try{ const status=this.updates[id]; await api.put(`/store/orders/${id}/status`,{status}); await this.fetch(); alert('Order status updated'); }catch(err){ alert(err.response?.data?.message||'Failed to update status') } },
      editableStatus(order){
        return order?.status === 'delivered' && order?.shipping_method === 'pickup' ? 'pickup' : order?.status
      },
      statusLabel(order){
        return this.editableStatus(order)?.replaceAll('_',' ')?.trim() || ''
      },
      capitalizeWords(str) {
        return String(str || '')
          .split('_')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ')
      },
      formatPaymentMethod(method) {
        const key = String(method || 'cod').toLowerCase()
        if (key === 'cod' || key === 'cash') return 'Cash'
        if (key === 'gcash') return 'GCash'
        return this.capitalizeWords(key)
      },
      formatDateTime(dateString) {
        if (!dateString) return 'N/A'
        try {
          return new Date(dateString).toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          })
        } catch (e) {
          return dateString
        }
      },
      calculateSubtotal() {
        return this.selectedItems.reduce((sum, item) => sum + (Number(item.subtotal) || 0), 0)
      },
      async saveQuantities(){
        try {
          const { data } = await api.put(`/store/orders/${this.selectedOrder.id}/quantities`, {
            quantities: this.selectedItems.map(item => ({ item_id: item.id, quantity: item.quantity }))
          })
          this.selectedItems = this.selectedItems.map(item => ({
            ...item,
            subtotal: Number(item.unit_price) * Number(item.quantity)
          }))
          this.selectedOrder = { ...this.selectedOrder, total_amount: data.total_amount }
          await this.fetch()
          alert('Actual quantities and order total saved')
        } catch (err) {
          alert(err.response?.data?.message || 'Failed to save actual quantities')
        }
      },
      formatDate(value) {
        if (!value) return 'N/A'
        const date = new Date(value)
        if (Number.isNaN(date.getTime())) return value
        return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
      },
      async openDetails(order){
        this.selectedOrder = order
        this.selectedItems = []
        this.showDetails = true
        this.loadingDetails = true
        try{
          const { data } = await api.get(`/store/orders/${order.id}/items`)
          this.selectedOrder = data?.order || order
          this.selectedItems = data?.items || []
        }catch(err){
          alert(err.response?.data?.message || 'Failed to load order details')
        }finally{
          this.loadingDetails = false
        }
      },
      closeDetails(){
        this.showDetails = false
        this.loadingDetails = false
        this.selectedOrder = null
        this.selectedItems = []
      }
  },
}
</script>
<style scoped>
.toolbar{margin-bottom:10px}
.table{width:100%;background:#fff;border-collapse:collapse;border-radius:8px;overflow:hidden;box-shadow:0 4px 14px rgba(56,92,35,.08)}
.table th,.table td{padding:10px 12px;border-bottom:1px solid #e6eddc}
.table th{background:#f4f8ee}
.table td.qty, .table td.price{text-align:right}
.empty{text-align:center;color:#6f7d67}
  .link{ margin-left:6px }
input,select{border:1px solid #cddbb9;border-radius:6px;padding:7px 10px;background:#fff}
button{background:linear-gradient(135deg,#7CB342,#4E7D32);color:#fff;border:none;padding:7px 10px;border-radius:6px;cursor:pointer}
button:hover{opacity:.9}
.modal-backdrop{position:fixed;inset:0;background:rgba(8,12,18,.45);z-index:2000}
.modal{position:fixed;z-index:2010;top:50%;left:50%;right:auto;bottom:auto;transform:translate(-50%,-50%);width:min(900px,calc(100vw - 24px));max-height:min(85vh, calc(100dvh - 24px));overflow:auto;background:#fff;border-radius:12px;padding:24px;box-shadow:0 10px 40px rgba(0,0,0,.3);-webkit-overflow-scrolling:touch}
.order-details-overlay{position:fixed;inset:0;z-index:2000;pointer-events:none}
.order-details-overlay .modal-backdrop,
.order-details-overlay .modal{pointer-events:auto}
.modal-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;border-bottom:2px solid #f4f8ee;padding-bottom:12px}
.modal-header h3{margin:0;font-size:22px;color:#1a1a1a}
.status-badge{display:inline-block;padding:6px 12px;border-radius:20px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.5px}
.status-pending{background:#ffeaa7;color:#d63031}
.status-on-the-way{background:#a29bfe;color:#fff}
.status-delivered{background:#55efc4;color:#00b894}
.status-pickup{background:#74b9ff;color:#0984e3}
.status-rejected{background:#fab1a0;color:#e17055}
.status-completed{background:#81ecec;color:#00b894}

.details-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:20px;margin:20px 0;padding:16px;background:#f9fbf6;border-radius:8px}
.detail-section{border-left:4px solid #7CB342;padding-left:12px}
.detail-section h4{margin:0 0 10px;font-size:13px;font-weight:700;color:#4E7D32;text-transform:uppercase;letter-spacing:.5px}
.detail-section p{margin:6px 0;font-size:14px;color:#333}
.detail-section p strong{color:#2a3a24;display:inline-block;min-width:120px}
.detail-section p.full-width{grid-column:1/-1}

.items-section{margin:20px 0}
.items-section h4{margin:0 0 12px;font-size:15px;font-weight:700;color:#2a3a24;border-bottom:2px solid #7CB342;padding-bottom:8px}

.order-summary{background:#f9fbf6;border-radius:8px;padding:16px;margin:20px 0;border-left:4px solid #7CB342}
.summary-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e6eddc;font-size:14px;color:#333}
.summary-row span:first-child{font-weight:500}
.summary-row span:last-child{text-align:right;min-width:100px}
.summary-row.total{border-bottom:2px solid #7CB342;border-top:1px solid #7CB342;margin-top:8px;padding-top:12px;font-size:16px;font-weight:700;color:#2a3a24}

.actions{margin-top:20px;display:flex;justify-content:flex-end;gap:10px;padding-top:16px;border-top:1px solid #e6eddc}
.close-btn{background:#757575;padding:8px 16px}
.close-btn:hover{opacity:.9}

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
  .modal{
    top:auto;
    left:12px;
    right:12px;
    bottom:calc(12px + env(safe-area-inset-bottom, 0px));
    transform:none;
    width:auto;
    max-height:min(78vh, calc(100dvh - 96px));
    padding:16px;
    border-radius:16px;
  }
  .modal-header{align-items:flex-start;gap:8px}
  .modal-header h3{font-size:18px}
  .close-btn{min-height:44px;width:100%}
  .actions{justify-content:stretch}
}
</style>
