<template>
  <div class="market-page">
    <div class="head">
      <div>
        <h2>Market Prices</h2>
        <p class="sub">Set AMAD market prices for products from every Kadiwa store. Customers see this beside the store’s Kadiwa price.</p>
      </div>
      <div class="controls">
        <label>Store
          <select v-model="storeOwnerId" @change="onFilterChange">
            <option value="">All Stores</option>
            <option v-for="s in stores" :key="s.id" :value="s.id">{{ s.store_name }}</option>
          </select>
        </label>
        <label>Search
          <input v-model="q" @input="debouncedFetch" placeholder="Product / category" />
        </label>
        <button class="secondary" @click="fetch" :disabled="loading">Refresh</button>
      </div>
    </div>

    <div class="summary">
      <article class="sum-card">
        <span>Products</span>
        <strong>{{ total }}</strong>
      </article>
      <article class="sum-card">
        <span>With Market Price</span>
        <strong>{{ withMarketCount }}</strong>
      </article>
      <article class="sum-card">
        <span>Missing Market Price</span>
        <strong>{{ missingMarketCount }}</strong>
      </article>
    </div>

    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>Store</th>
            <th>Product</th>
            <th>Category</th>
            <th>Unit</th>
            <th>Kadiwa Price</th>
            <th>Market Price</th>
            <th>Savings</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in rows" :key="p.id">
            <td data-label="Store">{{ p.store_name }}</td>
            <td data-label="Product">{{ p.name }}</td>
            <td data-label="Category">{{ p.category || '—' }}</td>
            <td data-label="Unit">{{ p.unit || '—' }}</td>
            <td data-label="Kadiwa Price">₱{{ Number(p.price || 0).toFixed(2) }}</td>
            <td data-label="Market Price">
              <input
                class="inline"
                type="number"
                min="0"
                step="0.01"
                :value="draft[p.id]"
                @input="onDraft(p.id, $event.target.value)"
                placeholder="0.00"
              />
            </td>
            <td data-label="Savings">
              <span v-if="savings(p) != null" :class="savings(p) >= 0 ? 'up' : 'down'">
                {{ savings(p) >= 0 ? '↓' : '↑' }} ₱{{ Math.abs(savings(p)).toFixed(2) }}
              </span>
              <span v-else class="muted">—</span>
            </td>
            <td data-label="Action">
              <div class="actions">
                <button class="primary" :disabled="savingId === p.id" @click="save(p)">
                  {{ savingId === p.id ? 'Saving…' : 'Save' }}
                </button>
                <button class="ghost" :disabled="savingId === p.id || !hasMarket(p)" @click="clear(p)">Clear</button>
              </div>
            </td>
          </tr>
          <tr v-if="!loading && rows.length === 0">
            <td colspan="8" class="empty">No products found</td>
          </tr>
          <tr v-if="loading">
            <td colspan="8" class="empty">Loading…</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="pagination">
      <button @click="prev" :disabled="page <= 1 || loading">Prev</button>
      <span>Page {{ page }} of {{ totalPages }}</span>
      <button @click="next" :disabled="page >= totalPages || loading">Next</button>
    </div>

    <p v-if="message" class="toast" :class="{ error: isError }">{{ message }}</p>
  </div>
</template>

<script>
import api from '../../services/api'

const debounce = (fn, d = 400) => {
  let t
  return (...a) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...a), d)
  }
}

export default {
  name: 'AdminMarketPrices',
  data() {
    return {
      stores: [],
      rows: [],
      draft: {},
      storeOwnerId: '',
      q: '',
      page: 1,
      pageSize: 20,
      total: 0,
      loading: false,
      savingId: null,
      message: '',
      isError: false,
      debouncedFetch: null
    }
  },
  computed: {
    totalPages() {
      return Math.max(1, Math.ceil(this.total / this.pageSize))
    },
    withMarketCount() {
      return this.rows.filter((r) => Number(r.market_price) > 0).length
    },
    missingMarketCount() {
      return this.rows.filter((r) => !(Number(r.market_price) > 0)).length
    }
  },
  async created() {
    this.debouncedFetch = debounce(() => {
      this.page = 1
      this.fetch()
    }, 400)
    await this.loadStores()
    await this.fetch()
  },
  methods: {
    async loadStores() {
      try {
        const { data } = await api.get('/admin/stores')
        this.stores = data || []
      } catch (e) {
        this.stores = []
      }
    },
    onFilterChange() {
      this.page = 1
      this.fetch()
    },
    async fetch() {
      this.loading = true
      this.message = ''
      try {
        const params = { page: this.page, pageSize: this.pageSize }
        if (this.storeOwnerId) params.storeOwnerId = this.storeOwnerId
        if (this.q) params.q = this.q
        const { data } = await api.get('/admin/market-prices', { params })
        this.rows = data.rows || []
        this.total = data.total || 0
        this.page = data.page || this.page
        this.pageSize = data.pageSize || this.pageSize
        const next = {}
        for (const r of this.rows) {
          next[r.id] = r.market_price == null || r.market_price === '' ? '' : Number(r.market_price)
        }
        this.draft = next
      } catch (e) {
        this.rows = []
        this.total = 0
        this.isError = true
        this.message = e?.response?.data?.message || 'Failed to load market prices'
      } finally {
        this.loading = false
      }
    },
    onDraft(id, value) {
      this.draft = { ...this.draft, [id]: value }
    },
    hasMarket(p) {
      return p.market_price != null && p.market_price !== '' && Number.isFinite(Number(p.market_price))
    },
    savings(p) {
      const market = Number(this.draft[p.id])
      const kadiwa = Number(p.price || 0)
      if (!Number.isFinite(market) || market <= 0) return null
      return market - kadiwa
    },
    async save(p) {
      const raw = this.draft[p.id]
      const market_price = raw === '' || raw === null || raw === undefined ? null : Number(raw)
      if (market_price !== null && (!Number.isFinite(market_price) || market_price < 0)) {
        this.isError = true
        this.message = 'Enter a valid market price'
        return
      }
      this.savingId = p.id
      this.message = ''
      try {
        const { data } = await api.put(`/admin/market-prices/${p.id}`, { market_price })
        const row = data.row
        this.rows = this.rows.map((r) => (r.id === p.id ? row : r))
        this.draft = {
          ...this.draft,
          [p.id]: row.market_price == null ? '' : Number(row.market_price)
        }
        this.isError = false
        this.message = `Saved market price for ${row.name}`
      } catch (e) {
        this.isError = true
        this.message = e?.response?.data?.message || 'Failed to save market price'
      } finally {
        this.savingId = null
      }
    },
    async clear(p) {
      this.draft = { ...this.draft, [p.id]: '' }
      await this.save({ ...p, market_price: null })
    },
    prev() {
      if (this.page > 1) {
        this.page -= 1
        this.fetch()
      }
    },
    next() {
      if (this.page < this.totalPages) {
        this.page += 1
        this.fetch()
      }
    }
  }
}
</script>

<style scoped>
.market-page { display: grid; gap: 12px; }
.head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 12px;
  flex-wrap: wrap;
}
.head h2 { margin: 0 0 4px; }
.sub { margin: 0; color: #5f7256; font-size: 13px; max-width: 520px; }
.controls { display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-end; }
label { display: grid; gap: 4px; font-size: 12px; color: #5f7256; }
input, select {
  min-height: 36px;
  border: 1px solid #cddbb9;
  border-radius: 10px;
  padding: 0 10px;
  background: #fff;
}
.secondary, .primary, .ghost, .pagination button {
  border-radius: 10px;
  min-height: 36px;
  padding: 0 12px;
  cursor: pointer;
}
.secondary { border: 1px solid #cddbb9; background: #fff; color: #2f5a23; }
.primary { border: none; background: #2f5a23; color: #fff; }
.ghost { border: 1px solid #cddbb9; background: #fff; color: #5f7256; }
.summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.sum-card {
  background: #fff;
  border: 1px solid #deead0;
  border-radius: 14px;
  padding: 10px 12px;
  box-shadow: 0 10px 24px rgba(56, 92, 35, 0.1);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.sum-card span { font-size: 12px; color: #5f7256; }
.sum-card strong { font-size: 1.1rem; }
.table-wrap {
  max-height: 520px;
  overflow: auto;
  border: 1px solid #deead0;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 10px 24px rgba(56, 92, 35, 0.1);
}
.table { width: 100%; border-collapse: collapse; }
.table thead th { position: sticky; top: 0; background: #f4f8ee; z-index: 2; }
.table th, .table td {
  padding: 10px 12px;
  border-bottom: 1px solid #e6eddc;
  text-align: left;
  font-size: 13px;
}
.inline {
  width: 110px;
  min-height: 34px;
  border: 1px solid #cddbb9;
  border-radius: 8px;
  padding: 0 8px;
}
.actions { display: flex; gap: 6px; flex-wrap: wrap; }
.up { color: #1d7a3a; font-weight: 700; }
.down { color: #b42318; font-weight: 700; }
.muted, .empty { color: #6b7c62; }
.pagination {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: flex-end;
}
.toast {
  margin: 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: #e8f6ea;
  color: #1d5c2a;
}
.toast.error { background: #fdecec; color: #8a1f1f; }

@media (max-width: 900px) {
  .summary { grid-template-columns: 1fr; }
  .table thead { display: none; }
  .table, .table tbody, .table tr, .table td { display: block; width: 100%; }
  .table tr {
    padding: 12px;
    border-bottom: 1px solid #e6eddc;
  }
  .table td {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    border: none;
    padding: 6px 0;
  }
  .table td::before {
    content: attr(data-label);
    font-weight: 700;
    color: #5f7256;
  }
  .inline { width: 120px; }
  .actions { justify-content: flex-end; }
  .pagination { justify-content: center; }
}
</style>
