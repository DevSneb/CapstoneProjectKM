<template>
  <div class="page">
    <h2>Cart</h2>
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>Item</th><th>Qty</th><th>Unit Price</th><th>Subtotal</th><th></th></tr></thead>
        <tbody>
          <tr v-for="it in cart" :key="it.product_id">
            <td>{{ it.name }}</td>
            <td>
              <input
                v-if="isVariableWeightUnit(it.unit)"
                type="number"
                min="0.001"
                step="0.001"
                v-model.number="it.quantity"
                @change="update(it)"
              />
              <span v-else class="fixed-quantity">1 piece</span>
            </td>
            <td>₱{{ fmt(it.unit_price) }}</td>
            <td>
              <template v-if="isVariableWeightUnit(it.unit)">
                ₱{{ fmt(Number(it.unit_price || 0) * Number(it.quantity || 0)) }}
                ~ ₱{{ fmt(Number(it.unit_price || 0) * Number(it.quantity || 0) + 20) }}
              </template>
              <template v-else>₱{{ fmt(it.unit_price * it.quantity) }}</template>
            </td>
            <td><button @click="remove(it)">Remove</button></td>
          </tr>
          <tr v-if="cart.length===0"><td colspan="5" class="empty">No items</td></tr>
        </tbody>
      </table>
    </div>
    <div class="summary" v-if="cart.length">
      <div>Total: ₱{{ fmt(total) }}</div>
      <div>Store: {{ derivedStoreId || '—' }}</div>
      <div class="checkout-note">Pickup or delivery • Cash (GCash available soon)</div>
      <button @click="checkout" :disabled="loading || !derivedStoreId">{{ loading?'Processing...':'Checkout' }}</button>
    </div>
  </div>
</template>
<script>
import api from '../services/api'
export default{
  name:'CustomerCart',
  data(){return{ loading:false}},
  computed:{
    cart(){ return this.$store.state.cart },
    total(){ return this.cart.reduce((s,i)=>s+i.unit_price*i.quantity,0) },
    derivedStoreId(){
      if(!this.cart.length) return 0
      const id = this.cart[0].store_owner_id
      if(this.cart.every(i=>i.store_owner_id===id)) return id
      return 0
    }
  },
  methods:{
    fmt(v){ const n=Number(v); return isFinite(n)?n.toFixed(2):'0.00' },
    isVariableWeightUnit(unit){
      return /(^|[\s/.-])(kg|kgs|kilo|kilos|kilogram|kilograms|g|gram|grams|mg|milligram|lb|lbs|pound|pounds|oz|ounce|ounces)(?=$|[\s/.-])/i.test(String(unit || '').trim())
    },
    update(it){
      const quantity = this.isVariableWeightUnit(it.unit) ? it.quantity : 1
      this.$store.dispatch('updateCartItem', { product_id: it.product_id, quantity })
    },
    remove(it){ this.$store.dispatch('updateCartItem', { product_id: it.product_id, quantity: 0 }) },
    async checkout(){
      if(!this.derivedStoreId){ alert('Cart must contain items from one store'); return }
      this.loading = true
      try{
        const items = this.cart.map(i=>({ product_id: i.product_id, quantity: i.quantity }))
        const { data } = await api.post('/customer/orders', {
          items,
          shipping_method: 'pickup',
          payment_method: 'cod'
        })
        alert('Order created: #' + data.id)
        this.$store.dispatch('clearCart')
      }catch(err){ alert(err.response?.data?.message || 'Checkout failed') }
      finally{ this.loading=false }
    }
  }
}
</script>
<style scoped>
.page{padding:20px}
.table-wrap{width:100%;overflow-x:auto}
.table{width:100%;min-width:560px;background:#fff;border-collapse:collapse;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06)}
.table th,.table td{padding:10px 12px;border-bottom:1px solid #eee}
.table th{background:#fafafa;text-align:left}
.empty{text-align:center;color:#999}
.fixed-quantity{display:inline-block;padding:7px 10px;color:#5f7256;font-weight:600}
.summary{margin-top:12px;display:flex;gap:12px;align-items:center}
.checkout-note{color:#5f7256;font-size:13px}
button{padding:8px 10px;border:1px solid #ddd;background:#fff;border-radius:6px;cursor:pointer}
@media (max-width:640px){
  .page{padding:16px 12px}
  .summary{flex-direction:column;align-items:stretch}
  .summary button{width:100%}
}
</style>
