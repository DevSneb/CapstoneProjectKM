<template>
  <div>
    <h2>Features Management</h2>
    <div class="toolbar">
      <label>Store
        <select v-model="selectedStoreId">
          <option value="all">All Stores (Global)</option>
          <option v-for="s in stores" :key="s.id" :value="String(s.id)">{{ s.store_name }}</option>
        </select>
      </label>
    </div>

    <table class="table">
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
    </table>
  </div>
</template>

<script>
import api from '../../services/api'
export default {
  name: 'AdminFeaturesManagement',
  data() {
    return {
      features: [],
      stores: [],
      globalFlags: [],
      storeFlags: [],
      selectedStoreId: 'all',
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
  async created() {
    await this.loadConfig()
  },
  methods: {
    async loadConfig() {
      const { data } = await api.get('/admin/features/config')
      this.features = data.features || []
      this.stores = data.stores || []
      this.globalFlags = data.global_flags || []
      this.storeFlags = data.store_flags || []
    },
    isEnabled(featureKey) {
      const g = this.globalFlags.find(x => x.feature_key === featureKey)
      const globalEnabled = g ? Number(g.enabled) === 1 : true
      if (this.selectedStoreId === 'all') return globalEnabled
      const sid = Number(this.selectedStoreId)
      const s = this.storeFlags.find(x => Number(x.store_owner_id) === sid && x.feature_key === featureKey)
      return s ? Number(s.enabled) === 1 : globalEnabled
    },
    async toggleFeature(featureKey) {
      const nextEnabled = !this.isEnabled(featureKey)
      if (this.selectedStoreId === 'all') {
        await api.put('/admin/features/global', { feature_key: featureKey, enabled: nextEnabled })
      } else {
        await api.put(`/admin/features/store/${this.selectedStoreId}`, { feature_key: featureKey, enabled: nextEnabled })
      }
      await this.loadConfig()
    }
  }
}
</script>

<style scoped>
.toolbar{display:flex;gap:10px;align-items:center;margin:10px 0}
.table{width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 4px 14px rgba(56,92,35,.08)}
.table th,.table td{padding:10px 12px;border-bottom:1px solid #e6eddc;text-align:left}
.table th{background:#f4f8ee}
.btn{padding:6px 10px;border:1px solid #cddbb9;background:#f8fbf4;border-radius:6px;cursor:pointer}
select{border:1px solid #cddbb9;border-radius:6px;padding:7px 10px;background:#fff}
</style>
