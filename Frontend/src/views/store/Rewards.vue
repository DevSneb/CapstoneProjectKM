<template>
  <div class="rewards-page">
    <header class="head">
      <div>
        <h2>Rewards</h2>
        <p class="lede">Set how customers earn and redeem points when buying from your store.</p>
      </div>
    </header>

    <div v-if="loadError" class="notice error">{{ loadError }}</div>

    <form class="form card" @submit.prevent="save">
      <label class="toggle-row">
        <span>
          <strong>Enable rewards for this store</strong>
          <small>When off, customers cannot earn or redeem points on your orders.</small>
        </span>
        <input type="checkbox" v-model="form.enabled" />
      </label>

      <fieldset :disabled="!form.enabled" class="rules">
        <label>
          Pesos spent to earn 1 point
          <input type="number" min="1" step="1" v-model.number="form.earn_pesos_per_point" required />
          <small>Example: 20 means ₱20 spent = 1 point after delivery.</small>
        </label>

        <label>
          Peso value of 1 point at checkout
          <input type="number" min="0.01" step="0.01" v-model.number="form.redeem_peso_per_point" required />
          <small>Example: 1 means 1 point = ₱1 discount.</small>
        </label>

        <label>
          Max redeem percent of order
          <input type="number" min="0" max="100" step="1" v-model.number="form.max_redeem_percent" required />
          <small>Example: 50 means points can cover up to half of the order total.</small>
        </label>

        <label>
          Minimum order amount to earn points (₱)
          <input type="number" min="0" step="0.01" v-model.number="form.min_order_amount_to_earn" required />
          <small>Delivered orders below this amount earn 0 points.</small>
        </label>

        <label>
          Customer-facing note
          <textarea v-model.trim="form.customer_note" maxlength="255" rows="3" placeholder="Shown near checkout rewards info"></textarea>
        </label>
      </fieldset>

      <div class="preview card-inner">
        <h3>Preview</h3>
        <ul>
          <li v-if="!form.enabled">Rewards are <strong>disabled</strong> for this store.</li>
          <template v-else>
            <li>Earn <strong>1 pt</strong> per <strong>₱{{ Number(form.earn_pesos_per_point || 0) }}</strong> on delivered orders.</li>
            <li>Redeem <strong>1 pt = ₱{{ Number(form.redeem_peso_per_point || 0).toFixed(2) }}</strong> off at checkout.</li>
            <li>Points can cover up to <strong>{{ Number(form.max_redeem_percent || 0) }}%</strong> of the order.</li>
            <li v-if="Number(form.min_order_amount_to_earn) > 0">
              Minimum delivered total to earn: <strong>₱{{ Number(form.min_order_amount_to_earn).toFixed(2) }}</strong>
            </li>
          </template>
        </ul>
      </div>

      <div class="actions">
        <button type="button" class="ghost" @click="resetDefaults" :disabled="saving">Reset defaults</button>
        <button type="submit" class="primary" :disabled="saving || loading">
          {{ saving ? 'Saving…' : 'Save conditions' }}
        </button>
      </div>
    </form>
  </div>
</template>

<script>
import api from '../../services/api'

const DEFAULT_FORM = {
  enabled: true,
  earn_pesos_per_point: 20,
  redeem_peso_per_point: 1,
  max_redeem_percent: 100,
  min_order_amount_to_earn: 0,
  customer_note: 'Earn points on delivered orders and redeem them as checkout discounts.'
}

export default {
  name: 'StoreRewards',
  data() {
    return {
      form: { ...DEFAULT_FORM },
      defaults: { ...DEFAULT_FORM },
      loading: false,
      saving: false,
      loadError: ''
    }
  },
  async created() {
    await this.load()
  },
  methods: {
    async load() {
      this.loading = true
      this.loadError = ''
      try {
        const { data } = await api.get('/store/rewards/settings')
        if (data?.defaults) this.defaults = { ...DEFAULT_FORM, ...data.defaults }
        if (data?.settings) {
          this.form = {
            enabled: data.settings.enabled !== false,
            earn_pesos_per_point: Number(data.settings.earn_pesos_per_point ?? 20),
            redeem_peso_per_point: Number(data.settings.redeem_peso_per_point ?? 1),
            max_redeem_percent: Number(data.settings.max_redeem_percent ?? 100),
            min_order_amount_to_earn: Number(data.settings.min_order_amount_to_earn ?? 0),
            customer_note: data.settings.customer_note || DEFAULT_FORM.customer_note
          }
        }
      } catch (err) {
        console.error(err)
        this.loadError = err?.response?.data?.message || 'Failed to load reward settings'
      } finally {
        this.loading = false
      }
    },
    resetDefaults() {
      this.form = { ...this.defaults }
    },
    async save() {
      this.saving = true
      try {
        const payload = {
          enabled: !!this.form.enabled,
          earn_pesos_per_point: Math.max(1, Math.floor(Number(this.form.earn_pesos_per_point) || 1)),
          redeem_peso_per_point: Math.max(0.01, Number(this.form.redeem_peso_per_point) || 0.01),
          max_redeem_percent: Math.min(100, Math.max(0, Number(this.form.max_redeem_percent) || 0)),
          min_order_amount_to_earn: Math.max(0, Number(this.form.min_order_amount_to_earn) || 0),
          customer_note: String(this.form.customer_note || '').slice(0, 255)
        }
        const { data } = await api.put('/store/rewards/settings', payload)
        if (data?.settings) {
          this.form.enabled = data.settings.enabled !== false
          this.form.earn_pesos_per_point = Number(data.settings.earn_pesos_per_point)
          this.form.redeem_peso_per_point = Number(data.settings.redeem_peso_per_point)
          this.form.max_redeem_percent = Number(data.settings.max_redeem_percent)
          this.form.min_order_amount_to_earn = Number(data.settings.min_order_amount_to_earn)
          this.form.customer_note = data.settings.customer_note || ''
        }
        alert('Reward conditions saved')
      } catch (err) {
        alert(err?.response?.data?.message || 'Failed to save reward settings')
      } finally {
        this.saving = false
      }
    }
  }
}
</script>

<style scoped>
.rewards-page {
  display: grid;
  gap: 14px;
  max-width: 720px;
}
.head h2 { margin: 0 0 4px; }
.lede {
  margin: 0;
  color: #5f6c55;
  font-size: 0.95rem;
}
.notice {
  padding: 10px 12px;
  border-radius: 10px;
  background: #fff4f2;
  color: #9b2c2c;
  border: 1px solid #f0c2ba;
}
.card {
  background: #fff;
  border: 1px solid #d9e8ca;
  border-radius: 14px;
  padding: 16px;
  box-shadow: 0 10px 24px rgba(56, 92, 35, 0.08);
}
.form { display: grid; gap: 14px; }
.toggle-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  background: #f4f8ef;
}
.toggle-row small {
  display: block;
  margin-top: 4px;
  color: #5f6c55;
  font-weight: 400;
}
.toggle-row input {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
}
.rules {
  border: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 12px;
}
.rules:disabled {
  opacity: 0.55;
}
label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-weight: 600;
  color: #24301f;
}
label small {
  font-weight: 400;
  color: #5f6c55;
}
input[type="number"],
textarea {
  padding: 10px 12px;
  border: 1px solid #cddbb9;
  border-radius: 10px;
  font: inherit;
  min-height: 44px;
}
.preview {
  background: #f7faf3;
  border-radius: 12px;
  padding: 12px 14px;
}
.preview h3 {
  margin: 0 0 8px;
  font-size: 0.95rem;
}
.preview ul {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 4px;
  color: #355e2a;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}
.primary,
.ghost {
  min-height: 44px;
  border-radius: 10px;
  padding: 10px 14px;
  cursor: pointer;
  font-weight: 600;
}
.primary {
  border: none;
  color: #fff;
  background: linear-gradient(135deg, #7CB342, #4E7D32);
}
.ghost {
  background: transparent;
  border: 1px solid #cddbb9;
  color: #355e2a;
}
@media (max-width: 640px) {
  .rewards-page { max-width: 100%; }
  .toggle-row {
    align-items: flex-start;
  }
  .actions {
    flex-direction: column-reverse;
  }
  .actions .primary,
  .actions .ghost {
    width: 100%;
  }
}
</style>
