<template>
  <div>
    <h2>Features Management</h2>
    <p>Manage which features are enabled for your store.</p>

    <div v-if="loadError" class="notice error">{{ loadError }}</div>

    <div class="table-wrap"><table class="table">
      <thead>
        <tr><th>Feature</th><th>Enabled</th><th>Action</th></tr>
      </thead>
      <tbody>
        <tr v-for="f in features" :key="f">
          <td>{{ labels[f] || f }}</td>
          <td>{{ isEnabled(f) ? 'Yes' : 'No' }}</td>
          <td>
            <button class="btn" @click="toggleFeature(f)">
              {{ isEnabled(f) ? 'Disable' : 'Enable' }}
            </button>
          </td>
        </tr>
      </tbody>
    </table></div>
  </div>
</template>

<script>
import api from '../../services/api'
export default {
  name: 'StoreFeaturesManagement',
  data() {
    return {
      featureFlags: {},
      loadError: '',
      labels: {
        products: 'Products',
        orders: 'Orders',
        inventory: 'Inventory',
        customers: 'Customers',
        reports: 'Reports',
        cashflow: 'Cash Flow',
        cashflow2: 'Cash Flow 2',
        forecasting: 'Forecasting',
        logistics: 'Delivery Service',
        notifications: 'Notifications',
        pos: 'POS'
      }
    }
  },
  computed: {
    features() {
      return Object.keys(this.labels)
    }
  },
  async created() {
    await this.loadFeatures()
  },
  methods: {
    async loadFeatures() {
      try {
        const { data } = await api.get('/store/features/me')
        this.featureFlags = data?.features || {}
        this.loadError = ''
      } catch (err) {
        console.error(err)
        this.featureFlags = {}
        this.loadError = err?.response?.data?.message || 'Failed to load store features'
      }
    },
    isEnabled(featureKey) {
      return this.featureFlags[featureKey] !== false
    },
    async toggleFeature(featureKey) {
      const nextEnabled = !this.isEnabled(featureKey)
      try {
        await api.put('/store/features/me', { feature_key: featureKey, enabled: nextEnabled })
        this.featureFlags[featureKey] = nextEnabled
      } catch (err) {
        alert('Failed to update feature')
      }
    }
  }
}
</script>

<style scoped>
.table{width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 4px 14px rgba(56,92,35,.08)}
.table th,.table td{padding:10px 12px;border-bottom:1px solid #e6eddc;text-align:left}
.table th{background:#f4f8ee}
.btn{padding:6px 10px;border:1px solid #cddbb9;background:#f8fbf4;border-radius:6px;cursor:pointer}

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