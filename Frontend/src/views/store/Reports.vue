<template>
  <div class="reports-page">
    <header class="reports-header">
      <div>
        <p class="eyebrow">KADIWA Store Reports</p>
        <h2>Sales Reports</h2>
        <p class="page-note">Review delivered sales, export PDF/Excel, and submit the DA report for the selected range.</p>
      </div>
      <div class="range-chip">
        <span>Range</span>
        <strong>{{ formattedRange }}</strong>
      </div>
    </header>

    <section class="panel controls-panel">
      <div class="panel-head">
        <div>
          <h3>Report Filters</h3>
          <p>Choose dates, then Apply. Downloads and DA submit use the same range.</p>
        </div>
      </div>
      <div class="filters">
        <label>From <input type="date" v-model="from" /></label>
        <label>To <input type="date" v-model="to" /></label>
        <label>Period
          <select v-model="period">
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </label>
        <div class="action-row">
          <button class="primary" @click="fetchAll" :disabled="loading">{{ loading ? 'Loading…' : 'Apply' }}</button>
          <label class="report-format">
            <span class="sr-only">Download report format</span>
            <select v-model="reportAction" class="secondary report-select" @change="handleReportAction" :disabled="loading || exporting">
              <option value="">Download report…</option>
              <option value="pdf">Download PDF</option>
              <option value="excel">Download Excel</option>
            </select>
          </label>
          <button class="success" @click="submitReportToDa" :disabled="loading || submitting">
            {{ submitting ? 'Submitting…' : 'Submit Report to DA' }}
          </button>
        </div>
        <div class="preset-row">
          <button type="button" class="preset" @click="setQuickRange(7)">7 Days</button>
          <button type="button" class="preset" @click="setQuickRange(30)">30 Days</button>
          <button type="button" class="preset" @click="setQuickRange(90)">90 Days</button>
        </div>
      </div>
      <p v-if="loadError" class="error-banner">{{ loadError }}</p>
    </section>

    <section class="summary-grid">
      <article class="summary-card accent">
        <span>Total Revenue</span>
        <strong>₱{{ totalRevenue.toFixed(2) }}</strong>
        <small>All delivered orders in range</small>
      </article>
      <article class="summary-card">
        <span>Delivery Sales</span>
        <strong>₱{{ deliveredRevenue.toFixed(2) }}</strong>
        <small>{{ deliveredOrderCount }} delivery orders</small>
      </article>
      <article class="summary-card">
        <span>Pickup Sales</span>
        <strong>₱{{ pickupRevenue.toFixed(2) }}</strong>
        <small>{{ pickupOrderCount }} pickup orders</small>
      </article>
      <article class="summary-card">
        <span>Total Orders</span>
        <strong>{{ orders.length }}</strong>
        <small>Delivered in the selected range</small>
      </article>
    </section>

    <section class="tab-bar" aria-label="Report views">
      <button type="button" class="tab-button" :class="{ active: activeTab === 'overview' }" @click="activeTab = 'overview'">Overview</button>
      <button type="button" class="tab-button" :class="{ active: activeTab === 'revenue' }" @click="activeTab = 'revenue'">Daily Revenue</button>
      <button type="button" class="tab-button" :class="{ active: activeTab === 'orders' }" @click="activeTab = 'orders'">Finalized Orders</button>
    </section>

    <section v-show="activeTab === 'overview' || activeTab === 'revenue'" class="panel report-panel" :class="{ focus: activeTab === 'revenue' }">
      <div class="panel-head">
        <div>
          <h3>Daily Revenue</h3>
          <p>Delivery and pickup revenue by day.</p>
        </div>
      </div>
      <div class="table-wrap">
        <table class="table daily-table">
          <thead><tr><th>Day</th><th>Channel</th><th>Orders</th><th>Revenue</th></tr></thead>
          <tbody>
            <tr v-for="d in daily" :key="`${d.day}-${d.channel}`">
              <td data-label="Day">{{ formatDay(d.day) }}</td>
              <td data-label="Channel">{{ channelLabel(d.channel) }}</td>
              <td data-label="Orders">{{ d.orders }}</td>
              <td data-label="Revenue">₱{{ Number(d.revenue).toFixed(2) }}</td>
            </tr>
            <tr v-if="!loading && daily.length===0"><td colspan="4" class="empty">No data for the selected range.</td></tr>
            <tr v-if="loading"><td colspan="4" class="empty">Loading…</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-show="activeTab === 'overview' || activeTab === 'orders'" class="panel report-panel" :class="{ focus: activeTab === 'orders' }">
      <div class="panel-head">
        <div>
          <h3>Finalized Orders</h3>
          <p>Delivered orders with shipping and payment details.</p>
        </div>
      </div>
      <div class="table-wrap large-table">
        <table class="table orders-table">
          <thead>
            <tr>
              <th>ID</th><th>Date</th><th>Customer</th><th>Channel</th>
              <th>Shipping</th><th>Payment</th><th>Delivery Fee</th><th>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="o in orders" :key="o.id">
              <td data-label="ID">#{{ o.id }}</td>
              <td data-label="Date">{{ formatDateTime(o.created_at) }}</td>
              <td data-label="Customer">{{ o.customer_name || '—' }}</td>
              <td data-label="Channel">{{ channelLabel(o.channel) }}</td>
              <td data-label="Shipping">{{ shippingLabel(o.shipping_method) }}</td>
              <td data-label="Payment">{{ paymentLabel(o.payment_method) }}</td>
              <td data-label="Delivery Fee">₱{{ Number(o.delivery_fee||0).toFixed(2) }}</td>
              <td data-label="Total">₱{{ Number(o.total_amount).toFixed(2) }}</td>
            </tr>
            <tr v-if="!loading && orders.length===0"><td colspan="8" class="empty">No orders for the selected range.</td></tr>
            <tr v-if="loading"><td colspan="8" class="empty">Loading…</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<script>
import api from '../../services/api'

export default {
  name: 'StoreReports',
  data() {
    const today = new Date()
    const to = today.toISOString().slice(0, 10)
    const fromDate = new Date()
    fromDate.setDate(today.getDate() - 30)
    const from = fromDate.toISOString().slice(0, 10)
    return {
      from,
      to,
      period: 'monthly',
      reportAction: '',
      activeTab: 'overview',
      daily: [],
      orders: [],
      loading: false,
      exporting: false,
      submitting: false,
      loadError: ''
    }
  },
  computed: {
    formattedRange() {
      if (!this.from && !this.to) return 'No range selected'
      const start = this.from ? new Date(this.from + 'T00:00:00').toLocaleDateString() : 'Start'
      const end = this.to ? new Date(this.to + 'T00:00:00').toLocaleDateString() : 'End'
      return `${start} – ${end}`
    },
    deliveredRevenue() {
      return (this.daily || [])
        .filter((d) => String(d.channel) === 'delivered')
        .reduce((sum, d) => sum + Number(d.revenue || 0), 0)
    },
    pickupRevenue() {
      return (this.daily || [])
        .filter((d) => String(d.channel) === 'pickup')
        .reduce((sum, d) => sum + Number(d.revenue || 0), 0)
    },
    totalRevenue() {
      return this.deliveredRevenue + this.pickupRevenue
    },
    deliveredOrderCount() {
      return (this.daily || [])
        .filter((d) => String(d.channel) === 'delivered')
        .reduce((sum, d) => sum + Number(d.orders || 0), 0)
    },
    pickupOrderCount() {
      return (this.daily || [])
        .filter((d) => String(d.channel) === 'pickup')
        .reduce((sum, d) => sum + Number(d.orders || 0), 0)
    }
  },
  created() {
    this.fetchAll()
  },
  methods: {
    channelLabel(channel) {
      return String(channel) === 'pickup' ? 'Pickup' : 'Delivery'
    },
    shippingLabel(method) {
      const key = String(method || 'delivery').toLowerCase()
      if (key === 'pickup') return 'Pickup'
      return 'Delivery'
    },
    paymentLabel(method) {
      const key = String(method || 'cod').toLowerCase()
      if (key === 'cod' || key === 'cash') return 'Cash'
      if (key === 'gcash') return 'GCash'
      return key
    },
    formatDay(day) {
      if (!day) return '—'
      try {
        return new Date(day).toLocaleDateString()
      } catch (_) {
        return String(day)
      }
    },
    formatDateTime(value) {
      if (!value) return '—'
      try {
        return new Date(value).toLocaleString()
      } catch (_) {
        return String(value)
      }
    },
    setQuickRange(days) {
      const end = new Date()
      const start = new Date()
      start.setDate(end.getDate() - days)
      this.from = start.toISOString().slice(0, 10)
      this.to = end.toISOString().slice(0, 10)
      this.fetchAll()
    },
    handleReportAction() {
      if (this.reportAction === 'pdf') this.generatePdfReport()
      if (this.reportAction === 'excel') this.downloadExcelForm()
      this.reportAction = ''
    },
    async fetchAll() {
      if (this.from && this.to && this.from > this.to) {
        this.loadError = '“From” date must be on or before “To” date.'
        return
      }
      this.loading = true
      this.loadError = ''
      const params = { from: this.from, to: this.to }
      try {
        const [dailyRes, ordersRes] = await Promise.all([
          api.get('/store/reports/sales', { params }),
          api.get('/store/reports/orders', { params })
        ])
        this.daily = Array.isArray(dailyRes.data)
          ? dailyRes.data
          : (Array.isArray(dailyRes.data?.data) ? dailyRes.data.data : [])
        this.orders = Array.isArray(ordersRes.data)
          ? ordersRes.data
          : (Array.isArray(ordersRes.data?.data) ? ordersRes.data.data : [])
      } catch (err) {
        this.daily = []
        this.orders = []
        this.loadError = err.response?.data?.message || 'Failed to load report data'
      } finally {
        this.loading = false
      }
    },
    async generatePdfReport() {
      this.exporting = true
      try {
        const res = await api.post('/store/reports/generate-pdf', {
          period: this.period,
          from: this.from,
          to: this.to
        }, { responseType: 'blob' })

        const disposition = res.headers?.['content-disposition'] || ''
        const match = disposition.match(/filename="?([^";]+)"?/i)
        const filename = (match && match[1]) ? match[1] : `sales_report_${this.from}_to_${this.to}.pdf`
        const mimeType = res.headers?.['content-type'] || 'application/pdf'

        const blob = new Blob([res.data], { type: mimeType })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = filename
        anchor.click()
        URL.revokeObjectURL(url)
      } catch (err) {
        alert(err.response?.data?.message || 'Failed to generate PDF report')
      } finally {
        this.exporting = false
      }
    },
    async downloadExcelForm() {
      this.exporting = true
      try {
        const res = await api.get('/store/reports/da-excel-form', {
          params: { from: this.from, to: this.to },
          responseType: 'blob'
        })
        const disposition = res.headers?.['content-disposition'] || ''
        const m = disposition.match(/filename="?([^";]+)"?/i)
        const filename = (m && m[1]) ? m[1] : `KADIWA-Sales-Report-Form_${new Date().toISOString().slice(0, 10)}.xlsx`
        const mimeType = res.headers?.['content-type'] || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

        const blob = new Blob([res.data], { type: mimeType })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
        URL.revokeObjectURL(url)
      } catch (err) {
        alert(err.response?.data?.message || 'Failed to download Excel form')
      } finally {
        this.exporting = false
      }
    },
    async submitReportToDa() {
      if (!confirm('Submit this report to DA? It will be recorded in the system.')) return
      this.submitting = true
      try {
        const { data } = await api.post('/store/reports/submit-to-da', {
          period: this.period,
          from: this.from,
          to: this.to
        })
        alert('Report submitted to DA successfully. Submission ID: ' + data?.submission_id)
      } catch (err) {
        alert(err.response?.data?.message || 'Failed to submit report to DA')
      } finally {
        this.submitting = false
      }
    }
  }
}
</script>

<style scoped>
.reports-page {
  display: grid;
  gap: 16px;
  max-width: 1200px;
  margin: 0 auto;
  padding: 8px 0 24px;
}
.reports-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
  padding: 4px 2px 8px;
}
.eyebrow {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: .12em;
  text-transform: uppercase;
  color: #6b8b4f;
}
.reports-header h2 {
  margin: 0;
  font-size: 30px;
  line-height: 1.1;
  color: #20351b;
}
.page-note {
  margin: 8px 0 0;
  color: #62755b;
  max-width: 640px;
}
.range-chip {
  min-width: 220px;
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px solid #dce8ce;
  background: linear-gradient(180deg, #fff, #f6f9f1);
  box-shadow: 0 10px 24px rgba(56, 92, 35, .08);
}
.range-chip span {
  display: block;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: .08em;
  color: #72876a;
  margin-bottom: 6px;
}
.range-chip strong { color: #29401f; }
.panel {
  border: 1px solid #dfe9d2;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 12px 30px rgba(56, 92, 35, .08);
}
.panel-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 18px 0;
}
.panel-head h3 { margin: 0; color: #22351c; font-size: 18px; }
.panel-head p { margin: 6px 0 0; color: #6a7a62; font-size: 13px; }
.controls-panel { padding-bottom: 18px; }
.filters {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  padding: 16px 18px 0;
}
.action-row {
  grid-column: 1 / -1;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  padding-top: 2px;
}
.preset-row {
  grid-column: 1 / -1;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  padding-top: 2px;
}
.filters label {
  display: grid;
  gap: 6px;
  font-size: 12px;
  color: #607355;
}
.filters input,
.filters select {
  min-height: 44px;
  border: 1px solid #cddbb9;
  border-radius: 12px;
  padding: 0 12px;
  background: #fff;
  color: #22351c;
  font-size: 16px;
}
.error-banner {
  margin: 12px 18px 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: #fff4f2;
  color: #9b2c2c;
  border: 1px solid #f0c2ba;
}
.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
.summary-card {
  border: 1px solid #dfe9d2;
  border-radius: 18px;
  background: linear-gradient(180deg, #fff, #f7faf3);
  padding: 16px 18px;
  box-shadow: 0 10px 24px rgba(56, 92, 35, .06);
  text-align: left;
}
.summary-card span {
  display: block;
  color: #6f8166;
  font-size: 13px;
  margin-bottom: 10px;
}
.summary-card strong {
  display: block;
  color: #20351b;
  font-size: 1.5rem;
  line-height: 1.1;
}
.summary-card small {
  display: block;
  margin-top: 8px;
  color: #7b8a74;
}
.summary-card.accent {
  background: linear-gradient(135deg, #7CB342, #4E7D32);
  border-color: #4e7d32;
}
.summary-card.accent span,
.summary-card.accent small,
.summary-card.accent strong { color: #fff; }
.tab-bar { display: flex; gap: 8px; flex-wrap: wrap; }
.tab-button {
  min-height: 40px;
  border: 1px solid #d9e5cb;
  background: #f7faf3;
  color: #4b6241;
  padding: 0 14px;
  border-radius: 999px;
  cursor: pointer;
  font-weight: 600;
}
.tab-button.active {
  background: linear-gradient(135deg, #7CB342, #4E7D32);
  color: #fff;
  border-color: #4e7d32;
}
.report-panel { padding-bottom: 6px; }
.report-panel.focus {
  border-color: #7CB342;
  box-shadow: 0 0 0 3px rgba(124, 179, 66, .12), 0 14px 28px rgba(56, 92, 35, .1);
}
.table-wrap {
  overflow: auto;
  border-top: 1px solid #edf2e3;
  margin-top: 16px;
  border-radius: 0 0 18px 18px;
  -webkit-overflow-scrolling: touch;
}
.large-table { max-height: 420px; }
.table {
  width: 100%;
  border-collapse: collapse;
  min-width: 640px;
}
.table thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: #f4f8ee;
}
.table th,
.table td {
  padding: 12px 14px;
  border-bottom: 1px solid #e6eddc;
  text-align: left;
  vertical-align: top;
}
.table tbody tr:hover { background: rgba(124, 179, 66, .08); }
.empty {
  text-align: center;
  color: #6f7d67;
  padding: 18px 12px;
}
.primary,
.secondary,
.success {
  min-height: 44px;
  border: none;
  padding: 0 14px;
  border-radius: 12px;
  cursor: pointer;
  font-weight: 600;
}
.primary {
  background: linear-gradient(135deg, #7CB342, #4E7D32);
  color: #fff;
}
.secondary { background: #eef4e2; color: #355e2a; }
.success {
  background: linear-gradient(135deg, #5ab65f, #399a3f);
  color: #fff;
}
.primary:disabled,
.secondary:disabled,
.success:disabled,
.report-select:disabled {
  opacity: .6;
  cursor: not-allowed;
}
.report-format { display: block; }
.report-select {
  appearance: auto;
  border: 1px solid #d9e5cb;
  background: #eef4e2;
  color: #355e2a;
  font: inherit;
  font-weight: 600;
  min-height: 44px;
  padding: 0 34px 0 14px;
  border-radius: 12px;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.preset {
  min-height: 36px;
  border: 1px solid #d9e5cb;
  background: #f7faf3;
  color: #4b6241;
  border-radius: 999px;
  padding: 0 12px;
  cursor: pointer;
  font-weight: 600;
}
.filters input:focus,
.filters select:focus {
  outline: none;
  border-color: #7CB342;
  box-shadow: 0 0 0 3px rgba(124, 179, 66, .15);
}

@media (max-width: 1100px) {
  .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 960px) {
  .reports-header,
  .panel-head { flex-direction: column; align-items: flex-start; }
  .reports-header h2 { font-size: 1.45rem; }
  .filters { grid-template-columns: 1fr; }
  .action-row { flex-direction: column; }
  .action-row > *,
  .preset-row button { width: 100%; }
  .range-chip { width: 100%; }
}

@media (max-width: 640px) {
  .summary-grid { grid-template-columns: 1fr; }
  .table { min-width: 0; }
  .daily-table thead,
  .orders-table thead { display: none; }
  .daily-table tbody,
  .orders-table tbody,
  .daily-table tr,
  .orders-table tr,
  .daily-table td,
  .orders-table td {
    display: block;
    width: 100%;
  }
  .daily-table tr,
  .orders-table tr {
    margin: 0 10px 10px;
    padding: 12px;
    border: 1px solid #e6eddc;
    border-radius: 14px;
    background: #fbfdf8;
  }
  .daily-table td,
  .orders-table td {
    padding: 4px 0;
    border-bottom: none;
  }
  .daily-table td::before,
  .orders-table td::before {
    content: attr(data-label);
    display: block;
    font-size: 0.72rem;
    color: #6f8166;
    font-weight: 600;
    margin-bottom: 2px;
  }
  .daily-table td.empty,
  .orders-table td.empty {
    text-align: center;
  }
  .daily-table td.empty::before,
  .orders-table td.empty::before { display: none; }
  .large-table { max-height: none; }
}
</style>
