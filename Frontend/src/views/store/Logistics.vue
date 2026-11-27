<template>
  <div>
    <h2>Delivery Service</h2>
    <div class="card">
      <p class="sub">Set the delivery fee for each barangay.</p>

      <div class="barangay-list">
        <div v-for="barangay in barangays" :key="barangay.name" class="barangay-row">
          <div class="barangay-name">{{ barangay.name }}</div>
          <div class="fee-input-wrapper">
            <span class="peso">₱</span>
            <input
              type="number"
              min="0"
              step="0.01"
              v-model.number="barangay.fee"
              class="fee-input"
              :disabled="saving"
            />
          </div>
        </div>
      </div>

      <button @click="save" :disabled="saving" class="save-btn">{{ saving ? 'Saving...' : 'Save Settings' }}</button>
    </div>
  </div>
</template>

<script>
import api from '../../services/api'
import { BARANGAYS } from '../../constants/barangays'

export default {
  name: 'StoreLogistics',
  data() {
    return {
      saving: false,
      barangays: BARANGAYS.map(name => ({ name, fee: 0 }))
    }
  },
  methods: {
    async loadBarangays() {
      try {
        const { data } = await api.get('/store/delivery-barangays')
        if (Array.isArray(data.barangays) && data.barangays.length) {
          this.barangays = data.barangays.map(row => ({
            name: row.name,
            fee: Number(row.fee || 0)
          }))
        }
      } catch (err) {
        console.error('Failed to load delivery barangays:', err.response?.data?.message)
      }
    },
    async save() {
      this.saving = true
      try {
        const barangays = {}
        for (const barangay of this.barangays) {
          barangays[barangay.name] = Number(barangay.fee || 0)
        }
        const { data } = await api.put('/store/delivery-barangays', { barangays })
        if (Array.isArray(data.barangays)) {
          this.barangays = data.barangays.map(row => ({
            name: row.name,
            fee: Number(row.fee || 0)
          }))
        }
        alert(data.message || 'Delivery barangay settings updated')
      } catch (err) {
        alert(err.response?.data?.message || 'Failed to update delivery barangay settings')
      } finally {
        this.saving = false
      }
    }
  },
  async mounted() {
    await this.loadBarangays()
  }
}
</script>

<style scoped>
.card {
  max-width: 1100px;
  background: #fff;
  border: 1px solid #e6eddc;
  border-radius: 10px;
  padding: 20px;
  box-shadow: 0 4px 14px rgba(56, 92, 35, 0.08);
}

.sub {
  margin: 0 0 20px;
  color: #6f7d67;
}

.barangay-list {
  max-height: 60vh;
  overflow-y: auto;
  border: 1px solid #e6eddc;
  border-radius: 8px;
  margin-bottom: 16px;
}

.barangay-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 10px 12px;
  border-bottom: 1px solid #f0f0f0;
}

.barangay-row:last-child {
  border-bottom: none;
}

.barangay-name {
  flex: 1;
  font-size: 14px;
  color: #333;
}

.fee-input-wrapper {
  display: flex;
  align-items: center;
  gap: 4px;
  width: fit-content;
}

.peso {
  font-size: 12px;
  color: #6f7d67;
  font-weight: 500;
}

.fee-input {
  width: 90px;
  border: 1px solid #cddbb9;
  border-radius: 4px;
  padding: 6px 8px;
  background: #fff;
  font-size: 13px;
  text-align: right;
  font-weight: 500;
}

.fee-input:hover {
  border-color: #b5c89e;
}

.fee-input:focus {
  outline: none;
  border-color: #7CB342;
  box-shadow: 0 0 4px rgba(124, 179, 66, 0.2);
}

.fee-input:disabled {
  background: #f5f5f5;
  cursor: not-allowed;
  opacity: 0.6;
}

.save-btn {
  background: linear-gradient(135deg, #7CB342, #4E7D32);
  color: #fff;
  border: none;
  padding: 10px 20px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  font-size: 14px;
}

.save-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #6ba32f, #3d6428);
}

.save-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
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
