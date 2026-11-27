<template>
  <div class="household-page">
    <div class="head">
      <h2>Household</h2>
      <p class="sub">Registered customers — names, addresses, and purchase history summary.</p>
      <div class="toolbar">
        <input v-model="q" class="search" placeholder="Search name, email, phone, or address" @input="debouncedFetch" />
        <div class="sort-row">
          <label class="sort-label">
            <span class="sort-heading">Sort by</span>
            <select v-model="sortField" class="sort-select">
              <option value="name">Name</option>
              <option value="address">Address</option>
              <option value="buyer">Buyer type</option>
            </select>
          </label>
          <label class="sort-label">
            <span class="sort-heading">Order</span>
            <select v-model="sortDir" class="sort-select">
              <option value="asc">{{ orderLabelAsc }}</option>
              <option value="desc">{{ orderLabelDesc }}</option>
            </select>
          </label>
        </div>
      </div>
    </div>

    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Address</th>
            <th>Buyer type</th>
            <th>Delivered orders</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in sortedRows" :key="row.id">
            <td class="name-cell">
              <div class="nm">{{ row.full_name }}</div>
              <div class="meta muted-sm">{{ row.email }}<template v-if="row.phone"> · {{ row.phone }}</template></div>
            </td>
            <td class="addr">{{ row.display_address }}</td>
            <td>
              <span class="badge" :class="badgeClass(row)">{{ row.buyer_label }}</span>
            </td>
            <td>{{ row.delivered_order_count }}</td>
          </tr>
          <tr v-if="sortedRows.length === 0 && !loading">
            <td colspan="4" class="empty">No customers match your search.</td>
          </tr>
          <tr v-if="loading">
            <td colspan="4" class="empty">Loading…</td>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="footnote">
      <strong>New buyer</strong> = exactly one delivered order.&nbsp;
      <strong>Repeated buyer</strong> = two or more delivered orders.&nbsp;
      <strong>No deliveries yet</strong> = registered but no completed delivery.
      For <strong>Buyer type</strong>, order runs from no deliveries → new → repeated (ascending) or the reverse (descending).
    </p>
  </div>
</template>

<script>
import api from '../../services/api'

export default {
  name: 'AdminHousehold',
  data() {
    return {
      rows: [],
      q: '',
      sortField: 'name',
      sortDir: 'asc',
      loading: false,
      fetchTimer: null
    }
  },
  computed: {
    orderLabelAsc() {
      return this.sortField === 'buyer' ? 'No deliveries → Repeated' : 'A–Z'
    },
    orderLabelDesc() {
      return this.sortField === 'buyer' ? 'Repeated → No deliveries' : 'Z–A'
    },
    sortedRows() {
      const list = [...this.rows]
      const cmpStr = (a, b) =>
        String(a ?? '').localeCompare(String(b ?? ''), undefined, { sensitivity: 'base', numeric: true })
      const buyerRank = (r) => {
        switch (r.buyer_type) {
          case 'none':
            return 0
          case 'new':
            return 1
          case 'repeated':
            return 2
          default:
            return 0
        }
      }
      const asc = this.sortDir === 'asc'

      const tieName = (a, b) => cmpStr(a.full_name, b.full_name)

      if (this.sortField === 'name') {
        list.sort((a, b) => (asc ? cmpStr(a.full_name, b.full_name) : cmpStr(b.full_name, a.full_name)))
      } else if (this.sortField === 'address') {
        list.sort((a, b) => {
          const c = asc ? cmpStr(a.display_address, b.display_address) : cmpStr(b.display_address, a.display_address)
          return c || tieName(a, b)
        })
      } else {
        list.sort((a, b) => {
          const d = asc ? buyerRank(a) - buyerRank(b) : buyerRank(b) - buyerRank(a)
          return d || tieName(a, b)
        })
      }
      return list
    }
  },
  async created() {
    await this.fetchHousehold()
  },
  beforeUnmount() {
    clearTimeout(this.fetchTimer)
  },
  methods: {
    badgeClass(row) {
      switch (row.buyer_type) {
        case 'repeated':
          return 'repeated'
        case 'new':
          return 'new'
        default:
          return 'none'
      }
    },
    debouncedFetch() {
      clearTimeout(this.fetchTimer)
      this.fetchTimer = setTimeout(() => this.fetchHousehold(), 300)
    },
    async fetchHousehold() {
      this.loading = true
      try {
        const { data } = await api.get('/admin/household', {
          params: this.q.trim() ? { q: this.q.trim() } : {}
        })
        this.rows = Array.isArray(data) ? data : []
      } catch (err) {
        console.error(err)
        this.rows = []
        alert(err.response?.data?.message || 'Failed to load household data')
      } finally {
        this.loading = false
      }
    }
  }
}
</script>

<style scoped>
.household-page {
  display: grid;
  gap: 12px;
}

.head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
}

.head h2 {
  margin: 0;
  flex: 1 1 100%;
}

.sub {
  margin: 0;
  flex: 1 1 100%;
  color: #6f7d67;
  font-size: 14px;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px;
  flex: 1 1 100%;
}

.search {
  min-height: 36px;
  border: 1px solid #cddbb9;
  border-radius: 10px;
  padding: 0 10px;
  background: #fff;
  min-width: min(280px, 100%);
  flex: 1 1 220px;
}

.sort-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: flex-end;
}

.sort-label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 160px;
}

.sort-heading {
  font-size: 12px;
  font-weight: 600;
  color: #5f7256;
}

.sort-select {
  min-height: 36px;
  border: 1px solid #cddbb9;
  border-radius: 10px;
  padding: 0 10px;
  background: #fff;
  font-size: 14px;
  color: #1f2d16;
  cursor: pointer;
}

.table-wrap {
  max-height: 560px;
  overflow: auto;
  border-radius: 14px;
  border: 1px solid #deead0;
  background: #fff;
  box-shadow: 0 10px 24px rgba(56, 92, 35, 0.1);
}

.table {
  width: 100%;
  border-collapse: collapse;
}

.table thead th {
  position: sticky;
  top: 0;
  background: #f4f8ee;
  z-index: 2;
}

.table th,
.table td {
  padding: 10px 12px;
  border-bottom: 1px solid #e6eddc;
  text-align: left;
  vertical-align: top;
}

.table tbody tr:hover {
  background: rgba(124, 179, 66, 0.08);
}

.name-cell .nm {
  font-weight: 600;
  color: #1f2d16;
}

.muted-sm {
  font-size: 12px;
  color: #6f7d67;
}

.addr {
  max-width: 420px;
  line-height: 1.35;
  font-size: 13px;
}

.badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}

.badge.new {
  background: rgba(236, 201, 75, 0.35);
  color: #5c4810;
}

.badge.repeated {
  background: rgba(124, 179, 66, 0.35);
  color: #2d4718;
}

.badge.none {
  background: rgba(148, 163, 184, 0.25);
  color: #475569;
}

.empty {
  text-align: center;
  color: #6f7d67;
}

.footnote {
  margin: 0;
  font-size: 13px;
  color: #5f7256;
  line-height: 1.45;
}

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
