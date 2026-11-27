<template>
  <div>
    <h2>Sales Forecasting</h2>
    <p class="page-lead">
      Machine Learning predicts upcoming daily sales from your recent delivered-order history.
    </p>

    <div class="forecast-tools">
      <label>Forecast Days
        <select v-model.number="forecastHorizon">
          <option :value="3">3</option>
          <option :value="7">7</option>
          <option :value="14">14</option>
          <option :value="30">30</option>
        </select>
      </label>
      <button class="primary" @click="fetchForecast" :disabled="forecastLoading">
        {{ forecastLoading ? 'Loading...' : 'Run Forecast' }}
      </button>
      <button class="secondary" @click="retrainModel" :disabled="retrainLoading">
        {{ retrainLoading ? 'Learning...' : 'Retrain from Orders' }}
      </button>
      <span v-if="engine" class="engine-pill" :class="engine">
        {{ engine === 'python' ? 'AI / ML model' : 'Fallback estimate' }}
      </span>
    </div>

    <div v-if="learningSummary" class="learning-banner">
      <strong>Continuous learning</strong>
      <span>{{ learningSummary }}</span>
    </div>

    <div v-if="forecastError" class="forecast-error">{{ forecastError }}</div>
    <div v-if="forecastWarning" class="forecast-warning">{{ forecastWarning }}</div>

    <div v-if="analytics" class="analytics-summary">
      <div><span>90-day average</span><strong>₱{{ Number(analytics.average_daily_sales || 0).toFixed(2) }}</strong></div>
      <div><span>Last 7-day average</span><strong>₱{{ Number(analytics.recent_7_day_average || 0).toFixed(2) }}</strong></div>
      <div><span>Sales trend</span><strong :class="`trend-${analytics.trend}`">{{ analytics.trend }}</strong></div>
      <div><span>Zero-sales days</span><strong>{{ analytics.zero_sales_days || 0 }}</strong></div>
    </div>

    <div v-if="chartSeries.length" class="graph-card">
      <div class="graph-head">
        <div>
          <strong>AI Sales Outlook</strong>
          <p class="trend-caption">
            Solid line = recent actual sales · Dashed line = ML predicted sales
            <span v-if="modelKey"> · Model: {{ modelKey }}</span>
          </p>
        </div>
        <div class="legend">
          <span class="legend-item"><i class="line actual"></i> Actual</span>
          <span class="legend-item"><i class="line predicted"></i> ML Predicted</span>
          <span class="legend-item"><span class="dot low"></span> Low</span>
          <span class="legend-item"><span class="dot mid"></span> Mid</span>
          <span class="legend-item"><span class="dot high"></span> High</span>
        </div>
      </div>

      <div class="chart-wrap">
        <svg class="line-chart" :viewBox="`0 0 ${chartWidth} ${chartHeight}`" role="img" aria-label="AI machine learning sales forecast chart">
          <!-- grid -->
          <line
            v-for="(tick, index) in yTicks"
            :key="`grid-${index}`"
            :x1="padding.left"
            :x2="chartWidth - padding.right"
            :y1="valueToY(tick)"
            :y2="valueToY(tick)"
            class="grid-line"
          />
          <!-- y labels -->
          <text
            v-for="(tick, index) in yTicks"
            :key="`ylabel-${index}`"
            :x="padding.left - 8"
            :y="valueToY(tick) + 4"
            class="axis-label"
            text-anchor="end"
          >{{ formatAxisMoney(tick) }}</text>

          <!-- average reference -->
          <line
            v-if="referenceAverage > 0"
            :x1="padding.left"
            :x2="chartWidth - padding.right"
            :y1="valueToY(referenceAverage)"
            :y2="valueToY(referenceAverage)"
            class="avg-line"
          />
          <text
            v-if="referenceAverage > 0"
            :x="chartWidth - padding.right"
            :y="valueToY(referenceAverage) - 6"
            class="avg-label"
            text-anchor="end"
          >7-day avg ₱{{ Number(referenceAverage).toFixed(0) }}</text>

          <!-- actual history -->
          <polyline
            v-if="actualPoints"
            :points="actualPoints"
            fill="none"
            stroke="#315322"
            stroke-width="3"
            stroke-linecap="round"
            stroke-linejoin="round"
          />

          <!-- connector from last actual to first prediction -->
          <line
            v-if="bridgeLine"
            :x1="bridgeLine.x1"
            :y1="bridgeLine.y1"
            :x2="bridgeLine.x2"
            :y2="bridgeLine.y2"
            class="bridge-line"
          />

          <!-- ML forecast -->
          <polyline
            v-if="predictedPoints"
            :points="predictedPoints"
            fill="none"
            stroke="#4E7D32"
            stroke-width="3"
            stroke-dasharray="7 5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />

          <!-- predicted dots by demand level -->
          <circle
            v-for="point in predictedPlot"
            :key="`dot-${point.index}`"
            :cx="point.x"
            :cy="point.y"
            r="5"
            :class="['dot-point', levelClass(point.level)]"
          />

          <!-- x labels -->
          <text
            v-for="label in xLabels"
            :key="`xlabel-${label.key}`"
            :x="label.x"
            :y="chartHeight - 12"
            class="axis-label"
            text-anchor="middle"
          >{{ label.text }}</text>

          <!-- split marker -->
          <line
            v-if="splitX !== null"
            :x1="splitX"
            :x2="splitX"
            :y1="padding.top"
            :y2="chartHeight - padding.bottom"
            class="split-line"
          />
          <text
            v-if="splitX !== null"
            :x="splitX + 6"
            :y="padding.top + 14"
            class="split-label"
          >ML starts</text>
        </svg>
      </div>

      <div class="interpret-box">
        <strong>How to interpret this AI / ML graph</strong>
        <ul>
          <li><b>Left of “ML starts”</b> — recent actual delivered sales used as model input.</li>
          <li><b>Right of “ML starts”</b> — Random Forest sales forecast for the next {{ forecastHorizon }} day(s).</li>
          <li><b>Low / Mid / High colors</b> — relative demand inside this forecast window (lowest third, middle, highest third), not permanent store labels.</li>
          <li><b>Dashed green line</b> — predicted peso sales; compare it to the solid actual line and the 7-day average.</li>
          <li v-if="engine === 'python'"><b>AI / ML model</b> — forecast came from the trained store model{{ modelKey ? ` (${modelKey})` : '' }}.</li>
          <li v-else-if="engine === 'fallback'"><b>Fallback estimate</b> — Python model was unavailable, so a simple trend estimate was used instead.</li>
        </ul>
      </div>
    </div>

    <div v-if="forecastRows.length" class="level-summary">
      <span class="badge low">Low days: {{ levelCounts.low }}</span>
      <span class="badge mid">Mid days: {{ levelCounts.mid }}</span>
      <span class="badge high">High days: {{ levelCounts.high }}</span>
      <span class="level-note">Based on predicted values in this run only</span>
    </div>

    <section class="trend-card">
      <div class="graph-head">
        <div>
          <strong>Product Trends</strong>
          <p class="trend-caption">Delivered sales: latest {{ trendDays }} days vs previous {{ trendDays }} days</p>
        </div>
        <span v-if="trendsLoading" class="trend-caption">Loading...</span>
      </div>
      <div v-if="trendsError" class="forecast-error">{{ trendsError }}</div>
      <div v-else-if="productTrends.length" class="table-wrap">
        <table class="table trends-table">
          <thead><tr><th>Product</th><th>Qty Sold</th><th>Revenue</th><th>Previous Qty</th><th>Trend</th></tr></thead>
          <tbody>
            <tr v-for="trend in productTrends" :key="trend.product_id">
              <td>{{ trend.product_name }}</td>
              <td>{{ formatQuantity(trend.current_quantity) }}</td>
              <td>₱{{ Number(trend.current_revenue).toFixed(2) }}</td>
              <td>{{ formatQuantity(trend.previous_quantity) }}</td>
              <td>
                <span class="trend-pill" :class="trend.trend">
                  {{ trend.trend === 'up' ? '↑' : trend.trend === 'down' ? '↓' : '→' }}
                  {{ Math.abs(Number(trend.trend_percent || 0)).toFixed(1) }}%
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="empty trend-empty">No delivered product sales found for this period.</p>
    </section>

    <div v-if="forecastRows.length" class="table-wrap">
      <table class="table">
        <thead><tr><th>Day</th><th>ML Predicted Sales</th><th>Demand Level</th><th>What it means</th></tr></thead>
        <tbody>
          <tr v-for="row in forecastRows" :key="row.dayIndex">
            <td>Day {{ row.dayIndex }}</td>
            <td>₱{{ Number(row.value).toFixed(2) }}</td>
            <td><span class="badge" :class="levelClass(row.level)">{{ row.level }}</span></td>
            <td class="meaning-cell">{{ levelMeaning(row.level) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-else class="empty">No forecast yet. Click Run Forecast.</div>
  </div>
</template>

<script>
import api from '../../services/api'

export default {
  name: 'StoreForecasting',
  data() {
    return {
      forecastHorizon: 7,
      forecastLoading: false,
      forecastError: '',
      forecastWarning: '',
      forecastRows: [],
      recentSales: [],
      analytics: null,
      engine: '',
      modelKey: '',
      learning: null,
      retrainLoading: false,
      productTrends: [],
      trendDays: 30,
      trendsLoading: false,
      trendsError: '',
      chartWidth: 760,
      chartHeight: 280,
      padding: { top: 28, right: 24, bottom: 36, left: 58 },
      historyWindow: 14
    }
  },
  computed: {
    historySeries() {
      const values = Array.isArray(this.recentSales) ? this.recentSales.map(v => Number(v || 0)) : []
      return values.slice(-this.historyWindow)
    },
    chartSeries() {
      const history = this.historySeries.map((value, index) => ({
        key: `a-${index}`,
        kind: 'actual',
        label: `A${index + 1}`,
        value
      }))
      const predicted = this.forecastRows.map((row) => ({
        key: `p-${row.dayIndex}`,
        kind: 'predicted',
        label: `D${row.dayIndex}`,
        value: Number(row.value || 0),
        level: row.level,
        dayIndex: row.dayIndex
      }))
      return [...history, ...predicted]
    },
    minValue() {
      if (!this.chartSeries.length) return 0
      const values = this.chartSeries.map(point => point.value)
      if (this.referenceAverage > 0) values.push(this.referenceAverage)
      return Math.min(...values, 0)
    },
    maxValue() {
      if (!this.chartSeries.length) return 1
      const values = this.chartSeries.map(point => point.value)
      if (this.referenceAverage > 0) values.push(this.referenceAverage)
      const max = Math.max(...values)
      return max <= this.minValue ? this.minValue + 1 : max
    },
    referenceAverage() {
      return Number(this.analytics?.recent_7_day_average || 0)
    },
    yTicks() {
      const min = this.minValue
      const max = this.maxValue
      const steps = 4
      const ticks = []
      for (let i = 0; i <= steps; i += 1) {
        ticks.push(min + ((max - min) * i) / steps)
      }
      return ticks
    },
    plotWidth() {
      return this.chartWidth - this.padding.left - this.padding.right
    },
    actualPlot() {
      return this.chartSeries
        .map((point, index) => ({ ...point, index, x: this.indexToX(index), y: this.valueToY(point.value) }))
        .filter(point => point.kind === 'actual')
    },
    predictedPlot() {
      return this.chartSeries
        .map((point, index) => ({ ...point, index, x: this.indexToX(index), y: this.valueToY(point.value) }))
        .filter(point => point.kind === 'predicted')
    },
    actualPoints() {
      if (this.actualPlot.length < 2) return ''
      return this.actualPlot.map(point => `${point.x},${point.y}`).join(' ')
    },
    predictedPoints() {
      if (!this.predictedPlot.length) return ''
      return this.predictedPlot.map(point => `${point.x},${point.y}`).join(' ')
    },
    bridgeLine() {
      if (!this.actualPlot.length || !this.predictedPlot.length) return null
      const lastActual = this.actualPlot[this.actualPlot.length - 1]
      const firstPredicted = this.predictedPlot[0]
      return {
        x1: lastActual.x,
        y1: lastActual.y,
        x2: firstPredicted.x,
        y2: firstPredicted.y
      }
    },
    splitX() {
      if (!this.actualPlot.length || !this.predictedPlot.length) return null
      const lastActual = this.actualPlot[this.actualPlot.length - 1]
      const firstPredicted = this.predictedPlot[0]
      return (lastActual.x + firstPredicted.x) / 2
    },
    xLabels() {
      const total = this.chartSeries.length
      if (!total) return []
      const labels = []
      const pushLabel = (index, text) => {
        labels.push({ key: `${text}-${index}`, x: this.indexToX(index), text })
      }
      if (this.actualPlot.length) {
        pushLabel(0, 'Past')
        pushLabel(this.actualPlot.length - 1, 'Now')
      }
      if (this.predictedPlot.length) {
        const firstPredIndex = this.actualPlot.length
        const lastPredIndex = total - 1
        pushLabel(firstPredIndex, 'D1')
        if (lastPredIndex !== firstPredIndex) {
          pushLabel(lastPredIndex, `D${this.forecastRows.length}`)
        }
      }
      return labels
    },
    levelCounts() {
      return this.forecastRows.reduce((acc, row) => {
        const key = String(row.level || '').toLowerCase()
        if (key === 'low') acc.low += 1
        if (key === 'mid') acc.mid += 1
        if (key === 'high') acc.high += 1
        return acc
      }, { low: 0, mid: 0, high: 0 })
    },
    learningSummary() {
      const learning = this.learning
      if (!learning) return ''
      if (!learning.trained_at) {
        return learning.message || 'Waiting for delivered orders so the model can learn from live sales.'
      }
      const when = new Date(learning.trained_at)
      const whenText = Number.isNaN(when.getTime()) ? learning.trained_at : when.toLocaleString()
      const okStores = Array.isArray(learning.results)
        ? learning.results.filter(item => item && item.ok).length
        : 0
      return `Last retrain ${whenText} · ${okStores} store model(s) updated from delivered orders.`
    }
  },
  created() {
    this.fetchForecast()
    this.fetchProductTrends()
  },
  methods: {
    levelClass(level) {
      return String(level || '').toLowerCase()
    },
    levelMeaning(level) {
      const key = String(level || '').toLowerCase()
      if (key === 'low') return 'Lower predicted demand day — stock carefully / expect softer sales'
      if (key === 'high') return 'Higher predicted demand day — prepare inventory and staffing'
      return 'Typical predicted demand for this forecast window'
    },
    classifyLevelAgainstRange(value, min, max) {
      const range = Math.max(1, max - min)
      const lowCutoff = min + range / 3
      const highCutoff = min + (2 * range) / 3
      if (value <= lowCutoff) return 'Low'
      if (value >= highCutoff) return 'High'
      return 'Mid'
    },
    indexToX(index) {
      const count = Math.max(1, this.chartSeries.length)
      const step = count > 1 ? this.plotWidth / (count - 1) : this.plotWidth
      return this.padding.left + index * step
    },
    valueToY(value) {
      const min = this.minValue
      const max = this.maxValue
      const range = Math.max(1, max - min)
      const plotHeight = this.chartHeight - this.padding.top - this.padding.bottom
      const normalized = (Number(value || 0) - min) / range
      return this.chartHeight - this.padding.bottom - normalized * plotHeight
    },
    formatAxisMoney(value) {
      const amount = Number(value || 0)
      if (amount >= 1000) return `₱${(amount / 1000).toFixed(amount >= 10000 ? 0 : 1)}k`
      return `₱${amount.toFixed(0)}`
    },
    formatQuantity(value) {
      return Number(value || 0).toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 3
      })
    },
    async fetchProductTrends() {
      this.trendsLoading = true
      this.trendsError = ''
      try {
        const { data } = await api.get('/store/reports/product-trends', {
          params: { days: this.trendDays }
        })
        this.productTrends = Array.isArray(data?.trends) ? data.trends : []
      } catch (err) {
        this.productTrends = []
        this.trendsError = err.response?.data?.message || 'Failed to load product trends'
      } finally {
        this.trendsLoading = false
      }
    },
    async fetchForecast() {
      this.forecastLoading = true
      this.forecastError = ''
      this.forecastWarning = ''
      try {
        const { data } = await api.get('/store/reports/forecast', {
          params: { horizon: this.forecastHorizon }
        })

        this.analytics = data?.analytics || null
        this.engine = data?.engine || ''
        this.modelKey = data?.model_key || ''
        this.learning = data?.learning || null
        this.recentSales = Array.isArray(data?.recent_sales) ? data.recent_sales : []

        if (data?.warning) {
          this.forecastWarning = data.engine === 'fallback'
            ? `Forecast used fallback mode: ${data.warning}`
            : String(data.warning)
        }

        const values = Array.isArray(data?.forecast) ? data.forecast : []
        const numericValues = values.map(value => Number(value || 0))
        const min = numericValues.length ? Math.min(...numericValues) : 0
        const max = numericValues.length ? Math.max(...numericValues) : 0
        this.forecastRows = numericValues.map((value, index) => ({
          dayIndex: index + 1,
          value,
          level: this.classifyLevelAgainstRange(value, min, max)
        }))
      } catch (err) {
        this.forecastRows = []
        this.recentSales = []
        this.analytics = null
        this.engine = ''
        this.modelKey = ''
        this.learning = null
        this.forecastError = err.response?.data?.message || 'Failed to load forecast'
      } finally {
        this.forecastLoading = false
      }
    },
    async retrainModel() {
      this.retrainLoading = true
      this.forecastError = ''
      this.forecastWarning = ''
      try {
        const { data } = await api.post('/store/reports/ml-retrain')
        this.learning = data?.status || data?.last_status || data || null
        if (data?.skipped) {
          this.forecastWarning = `Retrain skipped (${data.reason}). Models will learn on the next schedule/delivery window.`
        } else if (data?.ok === false) {
          this.forecastError = data?.message || 'Retrain failed'
        } else {
          this.forecastWarning = 'Model retrained from delivered orders. Running a fresh forecast...'
          await this.fetchForecast()
        }
      } catch (err) {
        this.forecastError = err.response?.data?.message || 'Failed to retrain from orders'
      } finally {
        this.retrainLoading = false
      }
    }
  }
}
</script>

<style scoped>
.page-lead{ margin:0 0 10px; color:#5f7256; max-width:720px }
.table{ width:100%; background:#fff; border-collapse:collapse; border-radius:8px; overflow:hidden; box-shadow:0 4px 14px rgba(56,92,35,.08) }
.table th,.table td{ padding:10px 12px; border-bottom:1px solid #e6eddc }
.table th{ background:#f4f8ee }
.meaning-cell{ color:#5f7256; font-size:13px }
.empty{ text-align:center; color:#6f7d67 }
.primary{ background:linear-gradient(135deg,#7CB342,#4E7D32); color:#fff; border:none; padding:8px 12px; border-radius:6px; cursor:pointer }
.secondary{ background:#fff; color:#315322; border:1px solid #cddbb9; padding:8px 12px; border-radius:6px; cursor:pointer }
.learning-banner{ display:flex; flex-wrap:wrap; gap:8px 14px; align-items:center; margin:0 0 10px; padding:10px 12px; background:#f4f8ee; border:1px solid #e3ecd6; border-radius:8px; color:#4b5d43; font-size:13px }
.learning-banner strong{ color:#315322 }
.forecast-tools{ display:flex; gap:10px; align-items:center; margin:10px 0; flex-wrap:wrap }
.forecast-tools select{ border:1px solid #cddbb9; border-radius:6px; padding:7px 10px; background:#fff }
.engine-pill{ display:inline-flex; align-items:center; padding:6px 10px; border-radius:999px; font-size:12px; font-weight:700 }
.engine-pill.python{ background:rgba(78,125,50,.16); color:#315322 }
.engine-pill.fallback{ background:rgba(202,138,4,.18); color:#854d0e }
.forecast-error{ color:#b91c1c; margin-bottom:8px }
.forecast-warning{ color:#92400e; margin-bottom:8px }
.analytics-summary{ display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; margin-bottom:10px }
.analytics-summary>div{ background:#fff; border:1px solid #e3ecd6; border-radius:8px; padding:10px }
.analytics-summary span{ display:block; color:#6f7d67; font-size:12px }
.analytics-summary strong{ display:block; margin-top:4px; color:#315322; text-transform:capitalize }
.trend-up{ color:#166534!important }
.trend-down{ color:#991b1b!important }
.graph-card{ background:#fff; border:1px solid #e3ecd6; border-radius:10px; padding:10px; margin-bottom:10px }
.trend-card{ background:#fff; border:1px solid #e3ecd6; border-radius:10px; padding:10px; margin:0 0 10px }
.graph-head{ display:flex; justify-content:space-between; align-items:flex-start; gap:12px; margin-bottom:8px; flex-wrap:wrap }
.trend-caption{ margin:4px 0 0; color:#6f7d67; font-size:12px }
.trends-table th,.trends-table td{ white-space:nowrap }
.trend-pill{ display:inline-block; min-width:64px; padding:4px 8px; border-radius:999px; text-align:center; font-size:12px; font-weight:700 }
.trend-pill.up{ background:rgba(22,163,74,.15); color:#166534 }
.trend-pill.down{ background:rgba(220,38,38,.14); color:#991b1b }
.trend-pill.stable{ background:rgba(107,114,128,.14); color:#4b5563 }
.trend-empty{ margin:8px 0 0 }
.legend{ display:flex; align-items:center; gap:12px; color:#5f7256; font-size:12px; flex-wrap:wrap }
.legend-item{ display:inline-flex; align-items:center; gap:5px }
.legend .line{ width:18px; height:3px; border-radius:2px; display:inline-block }
.legend .line.actual{ background:#315322 }
.legend .line.predicted{ background:#4E7D32; background-image:repeating-linear-gradient(90deg,#4E7D32 0 6px,transparent 6px 10px) }
.chart-wrap{ width:100%; overflow-x:auto }
.line-chart{ width:100%; min-width:560px; height:280px; background:#f8fbf4; border-radius:8px; border:1px solid #e6eddc }
.grid-line{ stroke:#e6eddc; stroke-width:1 }
.avg-line{ stroke:#94a3b8; stroke-width:1.5; stroke-dasharray:4 4 }
.avg-label{ fill:#64748b; font-size:11px }
.bridge-line{ stroke:#86a873; stroke-width:2; stroke-dasharray:3 4 }
.split-line{ stroke:#b7c9a6; stroke-width:1.5; stroke-dasharray:3 3 }
.split-label{ fill:#4b5d43; font-size:11px; font-weight:700 }
.axis-label{ fill:#6f7d67; font-size:11px }
.dot{ width:10px; height:10px; border-radius:50%; display:inline-block }
.dot.low{ background:#dc2626 }
.dot.mid{ background:#ca8a04 }
.dot.high{ background:#16a34a }
.dot-point.low{ fill:#dc2626 }
.dot-point.mid{ fill:#ca8a04 }
.dot-point.high{ fill:#16a34a }
.interpret-box{ margin-top:10px; padding:10px 12px; background:#f4f8ee; border:1px solid #e3ecd6; border-radius:8px }
.interpret-box strong{ display:block; color:#315322; margin-bottom:6px }
.interpret-box ul{ margin:0; padding-left:18px; color:#4b5d43; font-size:13px }
.interpret-box li{ margin:4px 0 }
.level-summary{ display:flex; gap:8px; margin:8px 0 10px; align-items:center; flex-wrap:wrap }
.level-note{ color:#6f7d67; font-size:12px }
.badge{ display:inline-block; border-radius:999px; padding:4px 10px; font-size:12px; font-weight:700 }
.badge.low{ background:rgba(220,38,38,.15); color:#991b1b }
.badge.mid{ background:rgba(202,138,4,.2); color:#854d0e }
.badge.high{ background:rgba(22,163,74,.18); color:#166534 }

/* mobile-dashboard-fix */
.table-wrap{width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch}
.table-wrap .table, table.table{width:100%}
@media (max-width: 640px){
  .analytics-summary{grid-template-columns:repeat(2,minmax(0,1fr))}
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
