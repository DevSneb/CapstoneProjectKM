<template>
  <div>
    <div class="toolbar">
      <div class="left">
        <strong>Items:</strong> {{ filteredRows.length }}
        <input v-model.trim="searchQ" class="search-input" placeholder="Search product name or description..." aria-label="Search product name or description" />
      </div>
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

    <div
      class="table-wrapper"
      ref="tableWrapper"
      :class="{ dragging: isTableDragging }"
      @pointerdown="startTableDrag"
    >
      <table class="table">
        <thead>
          <tr>
            <th>Image</th>
            <th>Name</th>
            <th>Description</th>
            <th>Unit</th>
            <th>Cost</th>
            <th>SRP</th>
            <th>SRP (VAT)</th>
            <th>Category</th>
            <th>Stock</th>
            <th>Price</th>
            <th>Last Changed</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in paginatedRows" :key="p.id">
            <td>
              <img v-if="p.image_url" :src="toPublicImageUrl(p.image_url)" alt="Product" class="thumb" />
              <span v-else>—</span>
            </td>
            <td>{{ p.name }}</td>
            <td class="desc">{{ p.description || '—' }}</td>
            <td>{{ p.unit || '—' }}</td>
            <td>{{ formatCurrency(p.cost) }}</td>
            <td>{{ formatCurrency(p.srp) }}</td>
            <td>{{ formatCurrency(p.srp_vat) }}</td>
            <td>{{ p.category || '—' }}</td>
            <td>{{ Number(p.stock || 0) }}</td>
            <td>{{ formatCurrency(p.price) }}</td>
            <td>{{ formatDateTime(p.updated_at) }}</td>
            <td>{{ p.status }}</td>
            <td class="actions">
              <button class="btn" @click="startEdit(p)">Edit</button>
              <button class="btn danger" @click="deleteProduct(p)">Delete</button>
            </td>
          </tr>
          <tr v-if="filteredRows.length===0"><td colspan="13" class="empty">No items</td></tr>
        </tbody>
      </table>
    </div>
    <div v-if="editForm" class="edit-overlay" @click.self="cancelEdit">
      <form class="edit-modal" @submit.prevent="saveEdit(editingId)">
        <div class="edit-modal-head">
          <h3>Edit Product</h3>
          <button type="button" class="icon-close" aria-label="Close" @click="cancelEdit">×</button>
        </div>
        <div class="edit-form-grid">
          <label class="full">Product name<input v-model.trim="editForm.name" required /></label>
          <label>Price<input type="number" min="0" step="0.01" v-model.number="editForm.price" required /></label>
          <label>Stock<input type="number" min="0" step="1" v-model.number="editForm.stock" required /></label>
          <label>Cost<input type="number" min="0" step="0.01" v-model.number="editForm.cost" /></label>
          <label>SRP<input type="number" min="0" step="0.01" v-model.number="editForm.srp" /></label>
          <label>SRP (VAT)<input type="number" min="0" step="0.01" v-model.number="editForm.srp_vat" /></label>
          <label>Unit
            <select v-model="editForm.unit"><option v-for="u in unitOptions" :key="u" :value="u">{{ u }}</option><option value="__other__">Others</option></select>
          </label>
          <label v-if="editForm.unit === '__other__'">Specify unit<input v-model.trim="editForm.unit_other" /></label>
          <label>Category
            <select v-model="editForm.category"><option v-for="c in categoryOptions" :key="c" :value="c">{{ c }}</option><option value="__other__">Others</option></select>
          </label>
          <label v-if="editForm.category === '__other__'">Specify category<input v-model.trim="editForm.category_other" /></label>
          <label>Status<select v-model="editForm.status"><option value="active">active</option><option value="inactive">inactive</option></select></label>
          <label class="full">Description<textarea v-model.trim="editForm.description" rows="3"></textarea></label>
          <label class="full">Image<input type="file" accept="image/*" @change="onEditImageSelected" /></label>
          <div class="full edit-preview">
            <img v-if="editImagePreviewUrl" :src="editImagePreviewUrl" alt="New product preview" class="edit-image" />
            <img v-else-if="editForm.image_url" :src="toPublicImageUrl(editForm.image_url)" alt="Product preview" class="edit-image" />
          </div>
        </div>
        <div class="edit-modal-actions">
          <button type="button" class="btn danger-outline" @click="cancelEdit">Cancel</button>
          <button type="submit" class="save" :disabled="savingId===editingId">{{ savingId===editingId ? 'Saving...' : 'Save Changes' }}</button>
        </div>
      </form>
    </div>
  </div>
</template>
<script>
import api from '../../services/api'
const API_ROOT = (api.defaults.baseURL || '').replace(/\/api\/?$/, '')
const UNIT_OPTIONS = ['PC/S', 'KG/S', 'LT/S']
const CATEGORY_OPTIONS = ['LOWLAND', 'HIGHLAND', 'FRUITS', 'RICE', 'EGGS (pc)', 'SEAFOOD', 'PORK', 'BEEF', 'CHICKEN', 'OTHER PRODUCTS']
function matchPreset(value, options) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const found = options.find((opt) => opt.toLowerCase() === raw.toLowerCase())
  return found || ''
}
export default {
  props:{ mode:{ type:String, required:true } },
  data(){
    return {
      rows: [],
      page: 1,
      pageSize: 25,
      searchQ: '',
      editingId: null,
      savingId: null,
      editForm: null,
      editImageDataUrl: null,
      editImagePreviewUrl: '',
      isTableDragging: false,
      tableDragStartX: 0,
      tableDragStartScrollLeft: 0,
      tableDragMoved: false,
      tableDragPointerId: null
    }
  },
  async created(){
    await this.refreshRows()
  },
  computed:{
    unitOptions(){
      return UNIT_OPTIONS
    },
    categoryOptions(){
      return CATEGORY_OPTIONS
    },
    filteredRows(){
      const q = this.searchQ.toLowerCase()
      if (!q) return this.rows
      return this.rows.filter((p) => {
        const hay = [p.name, p.description, p.category, p.unit, p.status]
          .map((x) => String(x || '').toLowerCase())
          .join(' ')
        return hay.includes(q)
      })
    },
    sortedRows(){
      return [...this.filteredRows].sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')))
    },
    totalPages(){
      return Math.max(1, Math.ceil(this.sortedRows.length / this.pageSize))
    },
    paginatedRows(){
      const start = (this.page-1) * this.pageSize
      return this.sortedRows.slice(start, start + this.pageSize)
    }
  },
  watch:{
    pageSize(){ this.page = 1 },
    searchQ(){ this.page = 1 }
  },
  methods:{
    startTableDrag(event) {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      if (event.target.closest('button, input, select, textarea, a, label')) return
      const wrapper = event.currentTarget
      if (wrapper.scrollWidth <= wrapper.clientWidth) return
      this.isTableDragging = true
      this.tableDragMoved = false
      this.tableDragStartX = event.clientX
      this.tableDragStartScrollLeft = wrapper.scrollLeft
      this.tableDragPointerId = event.pointerId
      wrapper.setPointerCapture?.(event.pointerId)
      document.addEventListener('pointermove', this.moveTableDrag, { passive: false })
      document.addEventListener('pointerup', this.stopTableDrag)
      document.addEventListener('pointercancel', this.stopTableDrag)
    },
    moveTableDrag(event) {
      if (!this.isTableDragging) return
      const wrapper = this.$refs.tableWrapper
      if (!wrapper || (this.tableDragPointerId !== null && event.pointerId !== this.tableDragPointerId)) return
      const distance = event.clientX - this.tableDragStartX
      if (Math.abs(distance) > 4) this.tableDragMoved = true
      wrapper.scrollLeft = this.tableDragStartScrollLeft - distance
      event.preventDefault()
    },
    stopTableDrag(event) {
      if (!this.isTableDragging) return
      const wrapper = this.$refs.tableWrapper
      if (event?.pointerId !== undefined && this.tableDragPointerId !== null && event.pointerId !== this.tableDragPointerId) return
      if (wrapper && this.tableDragPointerId !== null) wrapper.releasePointerCapture?.(this.tableDragPointerId)
      document.removeEventListener('pointermove', this.moveTableDrag)
      document.removeEventListener('pointerup', this.stopTableDrag)
      document.removeEventListener('pointercancel', this.stopTableDrag)
      this.isTableDragging = false
      this.tableDragPointerId = null
    },
    startEdit(p){
      const normalizedUnit = matchPreset(p.unit, UNIT_OPTIONS)
      const normalizedCategory = matchPreset(p.category, CATEGORY_OPTIONS)
      const resolvedUnit = this.unitOptions.includes(normalizedUnit) ? normalizedUnit : '__other__'
      const resolvedCategory = this.categoryOptions.includes(normalizedCategory) ? normalizedCategory : '__other__'
      this.editingId = p.id
      this.editImageDataUrl = null
      this.editImagePreviewUrl = ''
      this.editForm = {
        name: p.name || '',
        description: p.description || '',
        unit: resolvedUnit,
        unit_other: resolvedUnit === '__other__' ? String(p.unit || '').trim() : '',
        cost: p.cost ?? null,
        srp: p.srp ?? null,
        srp_vat: p.srp_vat ?? null,
        category: resolvedCategory,
        category_other: resolvedCategory === '__other__' ? String(p.category || '').trim() : '',
        stock: Number(p.stock || 0),
        price: Number(p.price || 0),
        status: p.status || 'active',
        image_url: p.image_url || null
      }
    },
    cancelEdit(){
      this.editingId = null
      this.savingId = null
      this.editForm = null
      this.editImageDataUrl = null
      this.editImagePreviewUrl = ''
    },
    async onEditImageSelected(event){
      const file = event.target?.files?.[0]
      if (!file) {
        this.editImageDataUrl = null
        this.editImagePreviewUrl = ''
        return
      }
      if (!file.type.startsWith('image/')) {
        alert('Please select a valid image file.')
        event.target.value = ''
        return
      }
      if (file.size > 2 * 1024 * 1024) {
        alert('Image is too large. Maximum size is 2MB.')
        event.target.value = ''
        return
      }
      this.editImageDataUrl = await this.readAsDataUrl(file)
      this.editImagePreviewUrl = this.editImageDataUrl
    },
    readAsDataUrl(file){
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(new Error('Failed to read image file'))
        reader.readAsDataURL(file)
      })
    },
    async saveEdit(id){
      if (!this.editForm) return
      const stockValue = Number(this.editForm.stock)
      const priceValue = Number(this.editForm.price)
      const costValue = this.editForm.cost === null || this.editForm.cost === '' || typeof this.editForm.cost === 'undefined' ? null : Number(this.editForm.cost)
      const srpValue = this.editForm.srp === null || this.editForm.srp === '' || typeof this.editForm.srp === 'undefined' ? null : Number(this.editForm.srp)
      const srpVatValue = this.editForm.srp_vat === null || this.editForm.srp_vat === '' || typeof this.editForm.srp_vat === 'undefined' ? null : Number(this.editForm.srp_vat)
      if (!Number.isInteger(stockValue) || stockValue < 0) {
        alert('Stock must be a non-negative whole number.')
        return
      }
      if (!Number.isFinite(priceValue) || priceValue < 0) {
        alert('Price must be a non-negative number.')
        return
      }
      const resolvedUnit = this.editForm.unit === '__other__' ? (this.editForm.unit_other || '').trim() : this.editForm.unit
      const resolvedCategory = this.editForm.category === '__other__' ? (this.editForm.category_other || '').trim() : this.editForm.category
      const finalUnit = resolvedUnit
      const finalCategory = resolvedCategory
      if (!finalUnit) {
        alert('Please select a unit or specify one in Others.')
        return
      }
      if (!finalCategory) {
        alert('Please select a category or specify one in Others.')
        return
      }
      if (costValue !== null && (!Number.isFinite(costValue) || costValue < 0)) {
        alert('Cost must be a non-negative number.')
        return
      }
      if (srpValue !== null && (!Number.isFinite(srpValue) || srpValue < 0)) {
        alert('SRP must be a non-negative number.')
        return
      }
      if (srpVatValue !== null && (!Number.isFinite(srpVatValue) || srpVatValue < 0)) {
        alert('SRP (VAT) must be a non-negative number.')
        return
      }
      this.savingId = id
      try {
        await api.put(`/store/products/${id}`, {
        name: this.editForm.name,
        description: this.editForm.description,
        unit: finalUnit,
        category: finalCategory,
        price: priceValue,
        cost: costValue,
        srp: srpValue,
        srp_vat: srpVatValue,
        status: this.editForm.status,
        stock: stockValue,
        image_data_url: this.editImageDataUrl || null
        })
        await this.refreshRows()
        this.cancelEdit()
      } catch (err) {
        const backendErrors = err.response?.data?.errors
        const backendMessage = Array.isArray(backendErrors) && backendErrors.length
          ? backendErrors.map((e) => e.msg).join(', ')
          : err.response?.data?.message
        alert(backendMessage || 'Failed to update product')
      } finally {
        this.savingId = null
      }
    },
    async deleteProduct(p){
      if (!confirm(`Delete product "${p.name}"?`)) return
      try {
        await api.delete(`/store/products/${p.id}`)
        if (this.editingId === p.id) this.cancelEdit()
        await this.refreshRows()
      } catch (err) {
        alert(err.response?.data?.message || 'Failed to delete product')
      }
    },
    async refreshRows(){
      if(this.mode==='low'){
        const {data}=await api.get('/store/inventory/low')
        this.rows=data
      }else if(this.mode==='out'){
        const {data}=await api.get('/store/inventory/out')
        this.rows=data
      }else{
        const {data}=await api.get('/store/products')
        this.rows=data
      }
      if (this.page > this.totalPages) this.page = this.totalPages
    },
    prevPage(){ if(this.page>1) this.page-- },
    nextPage(){ if(this.page<this.totalPages) this.page++ },
    formatCurrency(v){ const n = Number(v); return isFinite(n) ? n.toFixed(2) : '0.00' },
    toPublicImageUrl(imageUrl) {
      if (!imageUrl) return ''
      if (/^https?:\/\//i.test(imageUrl)) return imageUrl
      return `${API_ROOT}${imageUrl.startsWith('/') ? '' : '/'}${imageUrl}`
    },
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
.table-wrapper{width:100%;max-width:100%;overflow-x:auto;overflow-y:visible;-webkit-overflow-scrolling:touch;scrollbar-width:thin;cursor:grab;touch-action:pan-y}
.table-wrapper.dragging{cursor:grabbing;user-select:none}
.table-wrapper::-webkit-scrollbar{height:12px}
.table-wrapper::-webkit-scrollbar-track{background:#edf3e6;border-radius:8px}
.table-wrapper::-webkit-scrollbar-thumb{background:#7cb342;border:3px solid #edf3e6;border-radius:8px}
.table{width:100%;background:#fff;border-collapse:collapse;border-radius:8px;overflow:hidden;box-shadow:0 4px 14px rgba(56,92,35,.08)}
.table th,.table td{padding:10px 12px;border-bottom:1px solid #e6eddc}
.table th{background:#f4f8ee;text-align:left}
.table th:last-child,.table td:last-child{position:sticky;right:0;z-index:2;background:#fff;box-shadow:-5px 0 10px rgba(56,92,35,.08);min-width:132px}
.table th:last-child{background:#f4f8ee;z-index:3}
.desc{color:#48603b;max-width:420px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.toolbar{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px;min-width:0}
.toolbar .left{display:flex;gap:10px;align-items:center}
.toolbar .right{display:flex;gap:8px;align-items:center}
.search-input{min-width:180px;max-width:280px}
.btn{padding:6px 10px;border:1px solid #cddbb9;background:#f8fbf4;border-radius:6px;cursor:pointer}
.btn:disabled{opacity:.5;cursor:not-allowed}
.page{min-width:120px;text-align:center;display:inline-block}
.empty{text-align:center;color:#6f7d67}
.stock-input{width:90px}
.price-input{width:110px}
.txt-input{width:100%;min-width:120px;border:1px solid #cddbb9;border-radius:6px;padding:6px 8px;background:#fff}
.short-input{min-width:80px}
.search-input{min-width:0;width:100%;max-width:320px;border:1px solid #cddbb9;border-radius:6px;padding:7px 10px;background:#fff}
.file-input{display:block;margin-top:6px;max-width:170px}
.save{background:#7CB342;color:#fff;border:none;padding:7px 10px;border-radius:6px;cursor:pointer}
.actions{display:flex;gap:6px;align-items:center}
.danger{background:#fdf1f1;border-color:#f0caca;color:#a53030}
.danger-outline{background:#fff}
select{border:1px solid #cddbb9;border-radius:6px;padding:7px 10px;background:#fff}
.thumb{width:44px;height:44px;object-fit:cover;border-radius:6px;border:1px solid #e6eddc}
.edit-overlay{position:fixed;inset:0;z-index:2100;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(15,23,42,.48)}
.edit-modal{width:min(720px,100%);max-height:calc(100dvh - 32px);display:flex;flex-direction:column;overflow:hidden;background:#fff;border-radius:14px;padding:20px;box-shadow:0 18px 50px rgba(0,0,0,.28)}
.edit-modal-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
.edit-modal-head h3{margin:0;color:#25351f}
.icon-close{width:34px;height:34px;border:0;border-radius:8px;background:#f1f5ed;color:#43583a;font-size:22px;cursor:pointer}
.edit-modal form{display:flex;flex-direction:column;min-height:0}
.edit-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;overflow-y:auto;padding:2px 4px 8px 0}
.edit-form-grid label{display:grid;gap:5px;color:#42553b;font-size:13px;font-weight:600}
.edit-form-grid .full{grid-column:1/-1}
.edit-form-grid input,.edit-form-grid select,.edit-form-grid textarea{width:100%;min-width:0;border:1px solid #cddbb9;border-radius:6px;padding:9px 10px;background:#fff;font:inherit;font-weight:400;color:#1f2d1b}
.edit-form-grid textarea{resize:vertical}
.edit-preview{min-height:48px}
.edit-image{width:64px;height:64px;object-fit:cover;border:1px solid #e6eddc;border-radius:8px}
.edit-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:10px;padding-top:14px;border-top:1px solid #e6eddc;background:#fff;flex:0 0 auto}

/* mobile-dashboard-fix */
.table-wrap{width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch}
.table-wrap .table, table.table{width:100%}
@media (max-width: 640px){
  .edit-overlay{align-items:flex-start;padding:10px}
  .edit-modal{max-height:calc(100dvh - 20px);padding:16px}
  .edit-form-grid{grid-template-columns:1fr}
  .edit-form-grid .full{grid-column:auto}
  .toolbar,.filters,.head,.section-head,.graph-head,.forecast-tools,.reports-header,.form{flex-wrap:wrap}
  .toolbar,.filters,.head,.section-head{display:flex;gap:8px}
  .toolbar .left,.toolbar .right{width:100%;flex-wrap:wrap}
  .toolbar input,.search-input,input[type="search"],.search{min-width:0!important;width:100%;max-width:100%}
  .toolbar .right{justify-content:space-between}
  .table-wrapper .table{min-width:0;table-layout:fixed}
  .table-wrapper .table th,.table-wrapper .table td{padding:8px 6px;overflow-wrap:anywhere}
  .table-wrapper .table th:nth-child(1),
  .table-wrapper .table td:nth-child(1),
  .table-wrapper .table th:nth-child(3),
  .table-wrapper .table td:nth-child(3),
  .table-wrapper .table th:nth-child(7),
  .table-wrapper .table td:nth-child(7),
  .table-wrapper .table th:nth-child(8),
  .table-wrapper .table td:nth-child(8),
  .table-wrapper .table th:nth-child(11),
  .table-wrapper .table td:nth-child(11){display:none}
  .table-wrapper .table th:nth-child(2){width:25%}
  .table-wrapper .table th:nth-child(4){width:14%}
  .table-wrapper .table th:nth-child(5),
  .table-wrapper .table th:nth-child(6),
  .table-wrapper .table th:nth-child(9),
  .table-wrapper .table th:nth-child(10){width:13%}
  .table-wrapper .table th:nth-child(12){width:14%}
  .table-wrapper .table th:nth-child(13){width:18%}
  .table-wrapper .actions{white-space:normal}
  .table-wrapper .actions .btn,.table-wrapper .actions .save{margin:2px 0;width:100%}
  .btn,button.primary,button.save-btn{min-height:40px}
  .barangay-row{flex-direction:column;align-items:stretch!important}
  .map{height:260px!important}
  .details-grid{grid-template-columns:1fr!important}
  .card,.form{max-width:100%}
}
@media (min-width: 641px){
  .table-wrapper .table{min-width:1180px}
  .table-wrapper .actions{white-space:nowrap}
  .table-wrapper .actions .btn,.table-wrapper .actions .save{margin:2px}
}
@media (max-width: 640px){
  .table-wrapper{overflow:visible;cursor:default;touch-action:auto}
  .table-wrapper .table{display:block;width:100%;table-layout:auto;background:transparent;box-shadow:none}
  .table-wrapper .table thead{display:none}
  .table-wrapper .table tbody{display:block}
  .table-wrapper .table tbody tr{display:block;margin:0 0 12px;padding:8px;background:#fff;border:1px solid #e6eddc;border-radius:8px;box-shadow:0 3px 10px rgba(56,92,35,.07)}
  .table-wrapper .table tbody td{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;min-width:0;padding:9px 4px;border-bottom:1px solid #eef3e8}
  .table-wrapper .table tbody td:last-child{position:static;min-width:0;box-shadow:none;border-bottom:0}
  .table-wrapper .table tbody td::before{flex:0 0 34%;font-weight:700;color:#52644a}
  .table-wrapper .table tbody td:nth-child(1){display:flex}
  .table-wrapper .table tbody td:nth-child(1)::before{content:'Image'}
  .table-wrapper .table tbody td:nth-child(2){display:flex}
  .table-wrapper .table tbody td:nth-child(2)::before{content:'Name'}
  .table-wrapper .table tbody td:nth-child(3){display:flex}
  .table-wrapper .table tbody td:nth-child(3)::before{content:'Description'}
  .table-wrapper .table tbody td:nth-child(4)::before{content:'Unit'}
  .table-wrapper .table tbody td:nth-child(5)::before{content:'Cost'}
  .table-wrapper .table tbody td:nth-child(6)::before{content:'SRP'}
  .table-wrapper .table tbody td:nth-child(7)::before{content:'SRP (VAT)'}
  .table-wrapper .table tbody td:nth-child(8)::before{content:'Category'}
  .table-wrapper .table tbody td:nth-child(9)::before{content:'Stock'}
  .table-wrapper .table tbody td:nth-child(10)::before{content:'Price'}
  .table-wrapper .table tbody td:nth-child(11)::before{content:'Last Changed'}
  .table-wrapper .table tbody td:nth-child(12)::before{content:'Status'}
  .table-wrapper .table tbody td:nth-child(13){justify-content:flex-end;gap:8px}
  .table-wrapper .table tbody td:nth-child(13)::before{content:'Actions';margin-right:auto}
  .table-wrapper .table tbody td > span,
  .table-wrapper .table tbody td > input,
  .table-wrapper .table tbody td > select,
  .table-wrapper .table tbody td > template{max-width:64%}
  .table-wrapper .table tbody td.desc{white-space:normal;overflow:visible;text-overflow:clip}
  .table-wrapper .table tbody td.actions{display:flex;flex-wrap:wrap}
  .table-wrapper .table tbody td.actions .btn,
  .table-wrapper .table tbody td.actions .save{width:auto;min-width:82px;margin:0}
  .table-wrapper .table tbody tr:has(.empty){display:table-row}
  .table-wrapper .table tbody tr:has(.empty) td{display:table-cell;text-align:center}
  .table-wrapper .table tbody tr:has(.empty) td::before{display:none}
}
</style>
