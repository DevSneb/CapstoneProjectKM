<template>
  <div class="cashflow-page">
    <div class="head">
      <div>
        <h2>Cash Flow</h2>
        <p>Automatic accounting view for gain/loss and balance reconciliation.</p>
      </div>
      <div class="filters">
        <label>
          From
          <input type="date" v-model="from" @change="loadStatement" />
        </label>
        <label>
          To
          <input type="date" v-model="to" @change="loadStatement" />
        </label>
        <button class="secondary" :disabled="loadingStatement" @click="setLast30Days">Last 30 Days</button>
      </div>
    </div>

    <p v-if="loadingStatement" class="hint">Loading cash flow statement...</p>

    <section class="grid four">
      <article class="card">
        <span>Opening Balance</span>
        <strong>{{ asPeso(displayCashFlow.opening_balance) }}</strong>
      </article>
      <article class="card">
        <span>Total Cash In</span>
        <strong class="up">{{ asPeso(displayCashFlow.total_cash_in) }}</strong>
      </article>
      <article class="card">
        <span>Total Cash Out</span>
        <strong class="down">{{ asPeso(displayCashFlow.total_cash_out) }}</strong>
      </article>
      <article class="card">
        <span>Closing Balance</span>
        <strong>{{ asPeso(displayCashFlow.closing_balance) }}</strong>
      </article>
    </section>

    <section class="grid two">
      <article class="panel">
        <h3>Accounting Summary</h3>
        <div class="rows">
          <div><span>Revenue</span><strong>{{ asPeso(displayAccounting.revenue) }}</strong></div>
          <div><span>COGS</span><strong>{{ asPeso(displayAccounting.cogs) }}</strong></div>
          <div><span>Gross Profit</span><strong>{{ asPeso(displayAccounting.gross_profit) }}</strong></div>
          <div><span>Operating Expenses</span><strong>{{ asPeso(displayAccounting.operating_expenses) }}</strong></div>
          <div class="final">
            <span>Net {{ displayAccounting.result === 'gain' ? 'Gain' : 'Loss' }}</span>
            <strong :class="displayAccounting.result === 'gain' ? 'up' : 'down'">
              {{ asPeso(Math.abs(displayAccounting.net_profit_loss)) }}
            </strong>
          </div>
        </div>
      </article>

      <article class="panel">
        <h3>Balancing Check</h3>
        <div class="rows">
          <div><span>Computed Closing</span><strong>{{ asPeso(statement.balancing.computed_closing) }}</strong></div>
          <div><span>Actual Closing</span><strong>{{ asPeso(statement.balancing.actual_closing) }}</strong></div>
          <div><span>Difference</span><strong>{{ asPeso(statement.balancing.difference) }}</strong></div>
        </div>
        <p class="status" :class="statement.balancing.is_balanced ? 'ok' : 'warn'">
          {{ statement.balancing.is_balanced ? 'Balanced ✅' : 'Needs review ⚠️' }}
        </p>
      </article>
    </section>

    <section class="panel">
      <h3>Record Expense (Cash Out)</h3>
      <form class="expense-form" @submit.prevent="submitExpense">
        <input v-model="expense.description" placeholder="Expense description" required maxlength="255" />
        <input v-model.number="expense.amount" type="number" min="0.01" step="0.01" placeholder="Amount" required />
        <button :disabled="savingExpense" type="submit">{{ savingExpense ? 'Saving...' : 'Add Expense' }}</button>
      </form>
      <p class="hint">Expenses are included in cash-out and net gain/loss automatically.</p>
    </section>

    <section class="panel">
      <h3>Transactions Ledger</h3>
      <div class="table-wrap"><table class="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Reference</th>
            <th>Description</th>
            <th>Amount</th>
            <th>Running Balance</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="tx in statement.transactions" :key="tx.id">
            <td>{{ formatDate(tx.date) }}</td>
            <td>
              <span class="pill" :class="tx.type === 'Cash In' ? 'in' : 'out'">{{ tx.type }}</span>
            </td>
            <td>{{ tx.reference || '—' }}</td>
            <td>{{ tx.description || '—' }}</td>
            <td :class="tx.signed_amount >= 0 ? 'up' : 'down'">
              {{ tx.signed_amount >= 0 ? '+' : '-' }}{{ asPeso(Math.abs(tx.amount)) }}
            </td>
            <td>{{ asPeso(tx.running_balance) }}</td>
          </tr>
          <tr v-if="!statement.transactions.length">
            <td colspan="6" class="empty">No cash transactions for this date range.</td>
          </tr>
        </tbody>
      </table></div>
    </section>
  </div>
</template>

<script>
import api from '../../services/api'

function defaultDateRange() {
  const today = new Date()
  const to = today.toLocaleDateString('en-CA')
  const fromDate = new Date(today)
  fromDate.setDate(today.getDate() - 30)
  const from = fromDate.toLocaleDateString('en-CA')
  return { from, to }
}

export default {
  name: 'StoreCashFlow',
  data() {
    const { from, to } = defaultDateRange()
    return {
      from,
      to,
      savingExpense: false,
      loadingStatement: false,
      expense: {
        description: '',
        amount: null
      },
      statement: {
        cash_flow: {
          opening_balance: 0,
          total_cash_in: 0,
          total_cash_out: 0,
          net_cash_change: 0,
          closing_balance: 0
        },
        accounting: {
          revenue: 0,
          cogs: 0,
          gross_profit: 0,
          operating_expenses: 0,
          net_profit_loss: 0,
          result: 'gain'
        },
        balancing: {
          computed_closing: 0,
          actual_closing: 0,
          difference: 0,
          is_balanced: true
        },
        transactions: []
      }
    }
  },
  created() {
    this.loadStatement()
  },
  computed: {
    derivedCashFlowFromTransactions() {
      const txs = Array.isArray(this.statement.transactions) ? this.statement.transactions : []
      if (!txs.length) {
        return {
          opening_balance: this.numberOrZero(this.statement.cash_flow.opening_balance),
          total_cash_in: 0,
          total_cash_out: 0,
          net_cash_change: 0,
          closing_balance: this.numberOrZero(this.statement.cash_flow.closing_balance)
        }
      }

      let totalIn = 0
      let totalOut = 0
      for (const tx of txs) {
        const amount = this.numberOrZero(tx.amount)
        if (String(tx.type) === 'Cash In') totalIn += amount
        else totalOut += amount
      }

      const first = txs[0]
      const firstSigned = this.numberOrZero(first?.signed_amount)
      const firstRunning = this.numberOrZero(first?.running_balance)
      const opening = firstRunning - firstSigned
      const closing = this.numberOrZero(txs[txs.length - 1]?.running_balance)

      return {
        opening_balance: opening,
        total_cash_in: totalIn,
        total_cash_out: totalOut,
        net_cash_change: totalIn - totalOut,
        closing_balance: closing
      }
    },
    displayCashFlow() {
      const apiCash = this.statement.cash_flow || {}
      const hasMeaningfulApiTotals =
        this.numberOrZero(apiCash.total_cash_in) !== 0 ||
        this.numberOrZero(apiCash.total_cash_out) !== 0 ||
        this.numberOrZero(apiCash.closing_balance) !== 0

      if (hasMeaningfulApiTotals) {
        return {
          opening_balance: this.numberOrZero(apiCash.opening_balance),
          total_cash_in: this.numberOrZero(apiCash.total_cash_in),
          total_cash_out: this.numberOrZero(apiCash.total_cash_out),
          net_cash_change: this.numberOrZero(apiCash.net_cash_change),
          closing_balance: this.numberOrZero(apiCash.closing_balance)
        }
      }

      return this.derivedCashFlowFromTransactions
    },
    displayAccounting() {
      const acc = this.statement.accounting || {}
      const hasMeaningfulApiAccounting =
        this.numberOrZero(acc.revenue) !== 0 ||
        this.numberOrZero(acc.cogs) !== 0 ||
        this.numberOrZero(acc.operating_expenses) !== 0 ||
        this.numberOrZero(acc.net_profit_loss) !== 0

      if (hasMeaningfulApiAccounting) {
        return {
          revenue: this.numberOrZero(acc.revenue),
          cogs: this.numberOrZero(acc.cogs),
          gross_profit: this.numberOrZero(acc.gross_profit),
          operating_expenses: this.numberOrZero(acc.operating_expenses),
          net_profit_loss: this.numberOrZero(acc.net_profit_loss),
          result: acc.result === 'loss' ? 'loss' : 'gain'
        }
      }

      const revenue = this.numberOrZero(this.displayCashFlow.total_cash_in)
      const operatingExpenses = this.numberOrZero(this.displayCashFlow.total_cash_out)
      const cogs = 0
      const grossProfit = revenue - cogs
      const net = grossProfit - operatingExpenses
      return {
        revenue,
        cogs,
        gross_profit: grossProfit,
        operating_expenses: operatingExpenses,
        net_profit_loss: net,
        result: net >= 0 ? 'gain' : 'loss'
      }
    }
  },
  methods: {
    numberOrZero(value) {
      const n = Number(value)
      return Number.isFinite(n) ? n : 0
    },
    normalizeStatementPayload(data) {
      const cash = data?.cash_flow || {}
      const accounting = data?.accounting || {}
      const balancing = data?.balancing || {}

      return {
        store_id: data?.store_id,
        period: data?.period,
        cash_flow: {
          opening_balance: this.numberOrZero(cash.opening_balance),
          total_cash_in: this.numberOrZero(cash.total_cash_in),
          total_cash_out: this.numberOrZero(cash.total_cash_out),
          net_cash_change: this.numberOrZero(cash.net_cash_change),
          closing_balance: this.numberOrZero(cash.closing_balance)
        },
        accounting: {
          revenue: this.numberOrZero(accounting.revenue),
          cogs: this.numberOrZero(accounting.cogs),
          gross_profit: this.numberOrZero(accounting.gross_profit),
          operating_expenses: this.numberOrZero(accounting.operating_expenses),
          net_profit_loss: this.numberOrZero(accounting.net_profit_loss),
          result: accounting.result === 'loss' ? 'loss' : 'gain'
        },
        balancing: {
          computed_closing: this.numberOrZero(balancing.computed_closing),
          actual_closing: this.numberOrZero(balancing.actual_closing),
          difference: this.numberOrZero(balancing.difference),
          is_balanced: Boolean(balancing.is_balanced)
        },
        transactions: Array.isArray(data?.transactions) ? data.transactions.map((tx) => ({
          ...tx,
          amount: this.numberOrZero(tx?.amount),
          signed_amount: this.numberOrZero(tx?.signed_amount),
          running_balance: this.numberOrZero(tx?.running_balance)
        })) : []
      }
    },
    asPeso(value) {
      return Number(value || 0).toLocaleString(undefined, { style: 'currency', currency: 'PHP' })
    },
    formatDate(value) {
      return value ? new Date(value).toLocaleString() : '—'
    },
    getApiErrorMessage(err) {
      if (err?.response?.data?.message) return err.response.data.message
      const errors = err?.response?.data?.errors
      if (Array.isArray(errors) && errors.length) {
        return errors.map((item) => item.msg || item.message).join('; ')
      }
      if (err?.message) return err.message
      return 'An unexpected error occurred'
    },
    setLast30Days() {
      const { from, to } = defaultDateRange()
      this.from = from
      this.to = to
      this.loadStatement()
    },
    async loadStatement() {
      if (this.from && this.to && this.from > this.to) {
        alert('Invalid date range: From date must be on or before To date.')
        return
      }

      this.loadingStatement = true
      try {
        const { data } = await api.get('/cash/statement', {
          params: {
            from: this.from,
            to: this.to
          }
        })
        this.statement = this.normalizeStatementPayload(data)
      } catch (err) {
        alert(this.getApiErrorMessage(err) || 'Failed to load cash flow statement')
      } finally {
        this.loadingStatement = false
      }
    },
    async submitExpense() {
      const description = String(this.expense.description || '').trim()
      if (!description || Number(this.expense.amount || 0) <= 0) return
      this.savingExpense = true
      try {
        await api.post('/cash/expense', {
          description,
          amount: Number(this.expense.amount)
        })
        this.expense = { description: '', amount: null }
        await this.loadStatement()
        alert('Expense posted successfully.')
      } catch (err) {
        alert(this.getApiErrorMessage(err) || 'Failed to save expense')
      } finally {
        this.savingExpense = false
      }
    }
  }
}
</script>

<style scoped>
.cashflow-page{display:grid;gap:12px}
.head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}
.head h2{margin:0}
.head p{margin:4px 0 0;color:#5f6f53;font-size:13px}
.filters{display:flex;gap:8px;align-items:end;flex-wrap:wrap}
.filters label{display:grid;gap:4px;font-size:12px;color:#5f6f53}
.grid{display:grid;gap:12px}
.grid.four{grid-template-columns:repeat(4,minmax(0,1fr))}
.grid.two{grid-template-columns:repeat(2,minmax(0,1fr))}
.card,.panel{background:#fff;border:1px solid #deead0;border-radius:10px;padding:12px;box-shadow:0 4px 14px rgba(56,92,35,.08)}
.card span{font-size:12px;color:#5f6f53}
.card strong{display:block;margin-top:6px;font-size:20px}
.panel h3{margin:0 0 10px}
.rows{display:grid;gap:8px}
.rows div{display:flex;justify-content:space-between;gap:8px}
.final{padding-top:6px;border-top:1px dashed #d9e4cb}
.status{margin:10px 0 0;font-weight:600}
.status.ok{color:#2f5a23}
.status.warn{color:#8a3f20}
.expense-form{display:grid;grid-template-columns:1fr 180px auto;gap:8px}
.hint{margin:8px 0 0;font-size:12px;color:#5f6f53}
.table{width:100%;border-collapse:collapse}
.table th,.table td{padding:9px;border-bottom:1px solid #e6eddc;text-align:left}
.table th{background:#f4f8ee}
.pill{display:inline-block;padding:3px 8px;border-radius:999px;font-size:12px}
.pill.in{background:#e7f4da;color:#3d6b22}
.pill.out{background:#fff0ea;color:#8f3d1e}
.up{color:#2f5a23}
.down{color:#8f3d1e}
.empty{text-align:center;color:#6f7d67}
input,button{border:1px solid #cddbb9;border-radius:8px;min-height:36px;padding:0 10px}
button{background:linear-gradient(135deg,#7CB342,#4E7D32);color:#fff;border:none;cursor:pointer}
button.secondary{background:#f8fbf4;color:#2f5a23;border:1px solid #cddbb9}
button:disabled{opacity:.6;cursor:not-allowed}
@media (max-width:1100px){
  .grid.four{grid-template-columns:repeat(2,minmax(0,1fr))}
  .grid.two{grid-template-columns:1fr}
  .expense-form{grid-template-columns:1fr}
}
@media (max-width:640px){
  .grid.four{grid-template-columns:1fr}
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
