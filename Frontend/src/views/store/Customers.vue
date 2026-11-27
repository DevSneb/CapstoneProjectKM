<template>
  <div>
    <h2>Customers • {{ customerProgramTitle }}</h2>

    <div class="toolbar">
      <input v-model="q" @input="debouncedFetch" placeholder="Search customers..." />
      <div class="rule">{{ ruleText }}</div>
    </div>

    <div class="table-wrap"><table class="table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Username</th>
          <th>Email</th>
          <th>Phone</th>
          <th>Delivered Orders</th>
          <th>Total Purchases</th>
          <th v-if="showMembershipColumn">Membership</th>
          <th>{{ rewardColumnLabel }}</th>
          <th v-if="showActions">Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="c in rows" :key="c.id">
          <td>{{ c.full_name || '—' }}</td>
          <td>{{ c.username || '—' }}</td>
          <td>{{ c.email || '—' }}</td>
          <td>{{ c.phone || '—' }}</td>
          <td>{{ Number(c.delivered_orders || 0) }}</td>
          <td>₱{{ Number(c.total_spent || 0).toFixed(2) }}</td>
          <td v-if="showMembershipColumn">
            <span :class="['badge', c.is_kadiwa_member ? 'yes' : 'no']">
              {{ c.is_kadiwa_member ? 'Member' : 'Non-member' }}
            </span>
          </td>
          <td>{{ formatRewardValue(c) }}</td>
          <td v-if="showActions">
            <button
              :disabled="!isStore1 || savingIds[c.id]"
              @click="toggleMembership(c)"
            >
              {{ c.is_kadiwa_member ? 'Remove Member' : 'Set Member' }}
            </button>
          </td>
        </tr>
        <tr v-if="rows.length===0"><td :colspan="colspanCount" class="empty">No customers found</td></tr>
      </tbody>
    </table></div>

    <p v-if="isStore3" class="note">Store 3 rewards are savings-based: 5% of delivered purchases. This balance is investment-only and cannot pay for products.</p>
    <p v-else-if="!isStore1" class="note">Only Store 1 can assign Kadiwa consumer membership.</p>
  </div>
</template>

<script>
import api from '../../services/api'

const debounce = (fn, delay = 400) => {
  let t
  return (...args) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...args), delay)
  }
}

export default {
  name: 'StoreCustomers',
  data() {
    return {
      q: '',
      rows: [],
      savingIds: {}
    }
  },
  computed: {
    user() {
      return JSON.parse(localStorage.getItem('user') || '{}')
    },
    storeId() {
      return Number(this.user.id || 0)
    },
    isStore1() {
      return this.storeId === 1
    },
    isStore3() {
      return this.storeId === 3
    },
    customerProgramTitle() {
      if (this.isStore1) return 'Kadiwa Consumers'
      if (this.isStore3) return 'Store 3 Savings Rewards'
      return 'Store Customers'
    },
    ruleText() {
      if (this.isStore1) return 'Points rule: every ₱500 purchase = 1 point for member, 0.5 point for non-member'
      if (this.isStore3) return 'Savings rule: 5% of every delivered Store 3 purchase is credited to customer savings (non-redeemable)'
      return 'Rewards are managed by each store program. No cross-store mixing.'
    },
    rewardColumnLabel() {
      if (this.isStore1) return 'Points'
      if (this.isStore3) return 'Savings Balance'
      return 'Rewards'
    },
    showMembershipColumn() {
      return this.isStore1
    },
    showActions() {
      return this.isStore1
    },
    colspanCount() {
      let base = 7
      if (this.showMembershipColumn) base += 1
      if (this.showActions) base += 1
      return base
    }
  },
  created() {
    this.fetch()
    this.debouncedFetch = debounce(this.fetch, 400)
  },
  methods: {
    async fetch() {
      const { data } = await api.get('/store/customers', { params: { q: this.q || undefined } })
      this.rows = Array.isArray(data) ? data : []
    },
    async toggleMembership(customer) {
      if (!this.isStore1) return
      this.savingIds = { ...this.savingIds, [customer.id]: true }
      try {
        await api.put(`/store/customers/${customer.id}/membership`, {
          is_member: !customer.is_kadiwa_member
        })
        await this.fetch()
      } catch (err) {
        alert(err.response?.data?.message || 'Failed to update membership')
      } finally {
        this.savingIds = { ...this.savingIds, [customer.id]: false }
      }
    },
    formatRewardValue(customer) {
      if (this.isStore1) return Number(customer.points || 0).toFixed(1)
      if (this.isStore3) return `₱${Number(customer.savings_balance || 0).toFixed(2)}`
      return '—'
    }
  }
}
</script>

<style scoped>
.toolbar{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:12px}
.rule{font-size:12px;color:#5f6f53}
.table{width:100%;background:#fff;border-collapse:collapse;border-radius:8px;overflow:hidden;box-shadow:0 4px 14px rgba(56,92,35,.08)}
.table th,.table td{padding:10px 12px;border-bottom:1px solid #e6eddc}
.table th{background:#f4f8ee;text-align:left}
.badge{display:inline-block;padding:3px 8px;border-radius:999px;font-size:12px}
.badge.yes{background:#e7f4da;color:#3d6b22}
.badge.no{background:#f2f4ef;color:#4e5a46}
.empty{text-align:center;color:#6f7d67}
.note{margin-top:10px;color:#8b5e34;font-size:13px}
input{border:1px solid #cddbb9;border-radius:6px;padding:8px 10px;background:#fff;min-width:0;width:100%;max-width:100%}
button{background:linear-gradient(135deg,#7CB342,#4E7D32);color:#fff;border:none;padding:7px 10px;border-radius:6px;cursor:pointer}
button:disabled{opacity:.5;cursor:not-allowed}

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
