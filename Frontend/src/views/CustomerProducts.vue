<template>
  <div class="page">
    <h2>Products</h2>
    <div class="toolbar">
      <input v-model="q" @input="debouncedFetch" placeholder="Search products..."/>
      <select v-model.number="storeOwnerId" @change="fetchProducts">
        <option :value="0">All Stores</option>
        <option v-for="s in stores" :key="s.id" :value="s.id">{{ s.store_name }}</option>
      </select>
    </div>
    <div class="grid">
      <div class="card" v-for="p in products" :key="p.id">
        <img v-if="p.image_url" :src="toPublicImageUrl(p.image_url)" alt="Product image" class="product-image" />
        <h3>{{ productLabel(p) }}</h3>
        <p class="desc">{{ p.description || '—' }}</p>
        <p class="meta">{{ p.unit || '' }} • {{ p.category || '' }}</p>
        <p class="price">₱{{ fmt(p.price) }}</p>
        <button @click="add(p)">Add to Cart</button>
      </div>
    </div>
  </div>
</template>
<script>
import api from '../services/api'
const API_ROOT = (api.defaults.baseURL || '').replace(/\/api\/?$/, '')
export default{
  name:'CustomerProducts',
  data(){return{products:[], q:'', storeOwnerId:0, stores:[], debounceTimer:null}},
  async created(){
    await this.fetchStores();
    await this.fetchProducts();
  },
  methods:{
    async fetchStores(){
      // Derive store list from all active products returned by customer endpoint
      const resp = await api.get('/customer/products');
      const uniq = {};
      resp.data.forEach(p=>{ if(p.store_owner_id) uniq[p.store_owner_id] = true });
      this.stores = Object.keys(uniq).map(id=>({ id:Number(id), store_name:`Store ${id}` }));
    },
    async fetchProducts(){
      const params = {};
      if(this.q) params.q = this.q;
      if(this.storeOwnerId) params.storeOwnerId = this.storeOwnerId;
      const { data } = await api.get('/customer/products', { params });
      this.products = data;
    },
    debouncedFetch(){ clearTimeout(this.debounceTimer); this.debounceTimer = setTimeout(()=>this.fetchProducts(), 300) },
    add(p){
      this.$store.dispatch('addToCart', { product_id: p.id, name: this.productLabel(p), unit: p.unit, unit_price: p.price, quantity: 1, store_owner_id: p.store_owner_id })
    },
    toPublicImageUrl(imageUrl){
      if (!imageUrl) return ''
      if (/^https?:\/\//i.test(imageUrl)) return imageUrl
      return `${API_ROOT}${imageUrl.startsWith('/') ? '' : '/'}${imageUrl}`
    },
    productLabel(p){ return p.description || '—' },
    fmt(v){ const n=Number(v); return isFinite(n)?n.toFixed(2):'0.00' }
  }
}
</script>
<style scoped>
.page{padding:20px}
.toolbar{display:flex;gap:10px;margin-bottom:12px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}
.card{background:#fff;padding:12px;border:1px solid #eee;border-radius:8px}
.product-image{width:100%;height:130px;object-fit:cover;border-radius:6px;margin-bottom:8px;border:1px solid #eee}
.card h3{margin:0 0 4px}
.desc{color:#666;height:40px;overflow:hidden}
.price{font-weight:bold;color:#e04357}
button{padding:8px 10px;border:1px solid #ddd;background:#fff;border-radius:6px;cursor:pointer}
</style>
