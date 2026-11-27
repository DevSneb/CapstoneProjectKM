<template>
  <div class="qb-page">
    <section class="hero">
      <div>
        <h2>Cash Flow 2</h2>
        <p>Chart of accounts, journal entries, and statement snapshots for the selected period.</p>
      </div>
      <div class="filters">
        <label>
          From
          <input type="date" v-model="from" @change="loadAll" />
        </label>
        <label>
          To
          <input type="date" v-model="to" @change="loadAll" />
        </label>
        <button class="ghost" :disabled="loading" @click="setLast30Days">Last 30 Days</button>
      </div>
    </section>

    <p v-if="loading" class="hint">Loading accounting data...</p>

    <section class="cards">
      <article class="card">
        <span>Total Assets</span>
        <strong>{{ asPeso(balanceSheet.assets) }}</strong>
      </article>
      <article class="card">
        <span>Total Liabilities</span>
        <strong>{{ asPeso(balanceSheet.liabilities) }}</strong>
      </article>
      <article class="card">
        <span>Owner Equity</span>
        <strong>{{ asPeso(balanceSheet.equity) }}</strong>
      </article>
      <article class="card">
        <span>Net Income</span>
        <strong :class="incomeStatement.net_income >= 0 ? 'up' : 'down'">{{ asPeso(incomeStatement.net_income) }}</strong>
      </article>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h3>Chart of Accounts</h3>
      </div>
      <div class="table-wrap"><table class="table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Account</th>
            <th>Type</th>
            <th>Balance</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="acc in chartOfAccounts" :key="acc.code">
            <td>{{ acc.code }}</td>
            <td>{{ acc.name }}</td>
            <td>{{ acc.type }}</td>
            <td :class="acc.balance >= 0 ? 'up' : 'down'">{{ asPeso(acc.balance) }}</td>
          </tr>
        </tbody>
      </table></div>
    </section>

    <section class="panel two-col">
      <article>
        <h3>Income Statement</h3>
        <div class="rows">
          <div><span>Revenue</span><strong>{{ asPeso(incomeStatement.revenue) }}</strong></div>
          <div><span>Cost of Goods Sold</span><strong>{{ asPeso(incomeStatement.cogs) }}</strong></div>
          <div><span>Gross Profit</span><strong>{{ asPeso(incomeStatement.gross_profit) }}</strong></div>
          <div><span>Operating Expenses</span><strong>{{ asPeso(incomeStatement.operating_expenses) }}</strong></div>
          <div class="final"><span>Net Income</span><strong>{{ asPeso(incomeStatement.net_income) }}</strong></div>
        </div>
      </article>

      <article>
        <h3>Balance Sheet Snapshot</h3>
        <div class="rows">
          <div><span>Cash on Hand</span><strong>{{ asPeso(balanceSheet.cash_on_hand) }}</strong></div>
          <div><span>Accounts Receivable</span><strong>{{ asPeso(balanceSheet.accounts_receivable) }}</strong></div>
          <div><span>Total Assets</span><strong>{{ asPeso(balanceSheet.assets) }}</strong></div>
          <div><span>Total Liabilities</span><strong>{{ asPeso(balanceSheet.liabilities) }}</strong></div>
          <div class="final"><span>Owner Equity</span><strong>{{ asPeso(balanceSheet.equity) }}</strong></div>
        </div>
      </article>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h3>General Journal</h3>
        <small>Auto-generated from cash transactions</small>
      </div>
      <div class="table-wrap"><table class="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Reference</th>
            <th>Description</th>
            <th>Debit Account</th>
            <th>Credit Account</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="entry in journalEntries" :key="entry.id">
            <td>{{ formatDate(entry.date) }}</td>
            <td>{{ entry.reference }}</td>
            <td>{{ entry.description }}</td>
            <td>{{ entry.debit_account }}</td>
            <td>{{ entry.credit_account }}</td>
            <td>{{ asPeso(entry.amount) }}</td>
          </tr>
          <tr v-if="!journalEntries.length">
            <td colspan="6" class="empty">No journal entries for this period.</td>
          </tr>
        </tbody>
      </table></div>
    </section>

    <section class="panel">
      <h3>Quick Expense Entry</h3>
      <form class="expense-form" @submit.prevent="addExpense">
        <input v-model="expense.description" maxlength="255" required placeholder="Description (e.g. Utilities, Fuel, Rent)" />
        <input v-model.number="expense.amount" type="number" min="0.01" step="0.01" required placeholder="Amount" />
        <button :disabled="saving" type="submit">{{ saving ? 'Saving...' : 'Post Expense' }}</button>
      </form>
    </section>
  </div>
</template>

<script>
import api from '../../services/api'

function getDefaultRange() {
  const today = new Date()
  const to = today.toLocaleDateString('en-CA')
  const fromDate = new Date(today)
  fromDate.setDate(today.getDate() - 30)
  const from = fromDate.toLocaleDateString('en-CA')
  return { from, to }
}

export default {
  name: 'StoreCashFlow2',
  data() {
    const { from, to } = getDefaultRange()
    return {
      from,
      to,
      loading: false,
      saving: false,
      statement: null,
      pendingOrdersTotal: 0,
      expense: {
        description: '',
        amount: null
      }
    }
  },
  computed: {
    txs() {
      return Array.isArray(this.statement?.transactions) ? this.statement.transactions : []
    },
    normalizedCashFlow() {
      const apiCash = this.statement?.cash_flow || {}
      const txs = this.txs

      const apiHasNumbers =
        this.num(apiCash.total_cash_in) !== 0 ||
        this.num(apiCash.total_cash_out) !== 0 ||
        this.num(apiCash.closing_balance) !== 0

      if (apiHasNumbers) {
        return {
          opening_balance: this.num(apiCash.opening_balance),
          total_cash_in: this.num(apiCash.total_cash_in),
          total_cash_out: this.num(apiCash.total_cash_out),
          closing_balance: this.num(apiCash.closing_balance)
        }
      }

      if (!txs.length) {
        return {
          opening_balance: 0,
          total_cash_in: 0,
          total_cash_out: 0,
          closing_balance: 0
        }
      }

      let totalIn = 0
      let totalOut = 0
      for (const tx of txs) {
        const amount = this.num(tx.amount)
        if (String(tx.type) === 'Cash In') totalIn += amount
        else totalOut += amount
      }

      const first = txs[0]
      const opening = this.num(first.running_balance) - this.num(first.signed_amount)
      const closing = this.num(txs[txs.length - 1]?.running_balance)

      return {
        opening_balance: opening,
        total_cash_in: totalIn,
        total_cash_out: totalOut,
        closing_balance: closing
      }
    },
    incomeStatement() {
      const accounting = this.statement?.accounting || {}
      const revenue = this.num(accounting.revenue || this.normalizedCashFlow.total_cash_in)
      const cogs = this.num(accounting.cogs)
      const grossProfit = this.num(accounting.gross_profit || (revenue - cogs))
      const operatingExpenses = this.num(accounting.operating_expenses || this.normalizedCashFlow.total_cash_out)
      const netIncome = this.num(accounting.net_profit_loss || (grossProfit - operatingExpenses))

      return {
        revenue,
        cogs,
        gross_profit: grossProfit,
        operating_expenses: operatingExpenses,
        net_income: netIncome
      }
    },
    balanceSheet() {
      const cashOnHand = this.normalizedCashFlow.closing_balance
      const ar = this.pendingOrdersTotal
      const assets = this.num(cashOnHand + ar)
      const liabilities = 0
      const equity = this.num(assets - liabilities)
      return {
        cash_on_hand: cashOnHand,
        accounts_receivable: ar,
        assets,
        liabilities,
        equity
      }
    },
    chartOfAccounts() {
      return [
        { code: '1010', name: 'Cash on Hand', type: 'Asset', balance: this.balanceSheet.cash_on_hand },
        { code: '1100', name: 'Accounts Receivable', type: 'Asset', balance: this.balanceSheet.accounts_receivable },
        { code: '4000', name: 'Sales Revenue', type: 'Income', balance: this.incomeStatement.revenue },
        { code: '5000', name: 'Cost of Goods Sold', type: 'Expense', balance: this.incomeStatement.cogs },
        { code: '6100', name: 'Operating Expenses', type: 'Expense', balance: this.incomeStatement.operating_expenses },
        { code: '3000', name: 'Owner Equity', type: 'Equity', balance: this.balanceSheet.equity }
      ]
    },
    journalEntries() {
      return this.txs.map((tx) => {
        const cashIn = String(tx.type) === 'Cash In'
        const amount = this.num(tx.amount)
        return {
          id: tx.id,
          date: tx.date,
          reference: tx.reference || '-',
          description: tx.description || (cashIn ? 'Cash receipt' : 'Cash disbursement'),
          debit_account: cashIn ? 'Cash on Hand (1010)' : 'Operating Expenses (6100)',
          credit_account: cashIn ? 'Sales Revenue (4000)' : 'Cash on Hand (1010)',
          amount
        }
      })
    }
  },
  created() {
    this.loadAll()
  },
  methods: {
    num(value) {
      const n = Number(value)
      return Number.isFinite(n) ? n : 0
    },
    asPeso(value) {
      return this.num(value).toLocaleString(undefined, { style: 'currency', currency: 'PHP' })
    },
    formatDate(value) {
      return value ? new Date(value).toLocaleString() : '-'
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
      const { from, to } = getDefaultRange()
      this.from = from
      this.to = to
      this.loadAll()
    },
    async loadAll() {
      if (this.from && this.to && this.from > this.to) {
        alert('Invalid date range: From date must be on or before To date.')
        return
      }

      this.loading = true
      try {
        const [statementRes, pendingOrdersRes] = await Promise.all([
          api.get('/cash/statement', { params: { from: this.from, to: this.to } }),
          api.get('/store/orders', { params: { status: 'pending' } })
        ])

        this.statement = statementRes.data || null

        const pendingOrders = Array.isArray(pendingOrdersRes.data) ? pendingOrdersRes.data : []
        this.pendingOrdersTotal = pendingOrders.reduce((sum, row) => sum + this.num(row.total_amount), 0)
      } catch (err) {
        alert(this.getApiErrorMessage(err) || 'Failed to load accounting data')
      } finally {
        this.loading = false
      }
    },
    async addExpense() {
      const description = String(this.expense.description || '').trim()
      const amount = this.num(this.expense.amount)
      if (!description || amount <= 0) return

      this.saving = true
      try {
        await api.post('/cash/expense', { description, amount })
        this.expense = { description: '', amount: null }
        await this.loadAll()
        alert('Expense posted successfully.')
      } catch (err) {
        alert(this.getApiErrorMessage(err) || 'Failed to post expense entry')
      } finally {
        this.saving = false
      }
    }
  }
}
</script>

<style scoped>
.qb-page{display:grid;gap:12px}
.hero{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}
.hero h2{margin:0}
.hero p{margin:4px 0 0;color:#5f6f53;font-size:13px}
.filters{display:flex;gap:8px;align-items:end;flex-wrap:wrap}
.filters label{display:grid;gap:4px;font-size:12px;color:#5f6f53}
.cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.card,.panel{background:#fff;border:1px solid #deead0;border-radius:10px;padding:12px;box-shadow:0 4px 14px rgba(56,92,35,.08)}
.card span{font-size:12px;color:#5f6f53}
.card strong{display:block;margin-top:6px;font-size:22px}
.panel-head{display:flex;justify-content:space-between;gap:10px;align-items:center}
.two-col{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.rows{display:grid;gap:8px}
.rows div{display:flex;justify-content:space-between;gap:8px}
.final{padding-top:6px;border-top:1px dashed #d9e4cb}
.table{width:100%;border-collapse:collapse}
.table th,.table td{padding:9px;border-bottom:1px solid #e6eddc;text-align:left}
.table th{background:#f4f8ee}
.expense-form{display:grid;grid-template-columns:1fr 180px auto;gap:8px}
input,button{border:1px solid #cddbb9;border-radius:8px;min-height:36px;padding:0 10px}
button{background:linear-gradient(135deg,#7CB342,#4E7D32);color:#fff;border:none;cursor:pointer}
button.ghost{background:#f8fbf4;color:#2f5a23;border:1px solid #cddbb9}
button:disabled{opacity:.6;cursor:not-allowed}
.hint{margin:0;color:#5f6f53;font-size:12px}
.empty{text-align:center;color:#6f7d67}
.up{color:#2f5a23}
.down{color:#8f3d1e}
@media (max-width:1100px){
  .cards{grid-template-columns:repeat(2,minmax(0,1fr))}
  .two-col{grid-template-columns:1fr}
  .expense-form{grid-template-columns:1fr}
}
@media (max-width:640px){
  .cards{grid-template-columns:1fr}
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
