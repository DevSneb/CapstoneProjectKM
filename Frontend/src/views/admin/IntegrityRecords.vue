<template>
  <div class="integrity-page">
    <h2>Blockchain Integrity Records</h2>

    <section class="panel">
      <h3>Create Secured Record</h3>
      <form class="form" @submit.prevent="createRecord">
        <label>
          Customer Name
          <input v-model="form.customer.name" required placeholder="Customer full name" />
        </label>
        <label>
          Customer Email
          <input v-model="form.customer.email" type="email" required placeholder="Customer email" />
        </label>
        <label>
          Customer Address
          <input v-model="form.customer.address" required placeholder="Customer address" />
        </label>

        <label>
          Document Type
          <select v-model="form.document.mime_type">
            <option value="text/plain">Text</option>
            <option value="application/pdf">PDF (Base64)</option>
          </select>
        </label>
        <label>
          Document Filename
          <input v-model="form.document.filename" required placeholder="report.txt or report.pdf" />
        </label>

        <label v-if="form.document.mime_type==='text/plain'" class="full">
          Document Text Content
          <textarea v-model="form.document.text" rows="5" placeholder="Paste report text content"></textarea>
        </label>

        <label v-else class="full">
          Document Base64 Content
          <textarea v-model="form.document.content_base64" rows="5" placeholder="Paste PDF file base64 content"></textarea>
        </label>

        <div class="actions full">
          <button :disabled="saving">{{ saving ? 'Securing...' : 'Encrypt + Anchor' }}</button>
        </div>
      </form>

      <div v-if="createdRecord" class="result ok">
        Created: {{ createdRecord.record_ref }}
      </div>
    </section>

    <section class="panel">
      <h3>Verify Integrity</h3>
      <div class="verify-row">
        <input v-model="verify.recordRef" placeholder="Record Ref (e.g. REC-...)" />
        <select v-model="verify.target">
          <option value="customer">Customer Data</option>
          <option value="document">Document</option>
        </select>
        <button :disabled="verifying" @click="verifyRecord">{{ verifying ? 'Verifying...' : 'Verify' }}</button>
      </div>
      <div v-if="verifyResult" class="result" :class="verifyResult.is_valid ? 'ok' : 'warn'">
        {{ verifyResult.is_valid ? 'Valid integrity ✅' : 'Integrity mismatch ⚠️' }}
      </div>
    </section>

    <section class="panel">
      <div class="section-head">
        <h3>Recent Records</h3>
        <button class="secondary" @click="loadRecords">Refresh</button>
      </div>
      <div class="table-wrap"><table class="table">
        <thead>
          <tr>
            <th>Record Ref</th>
            <th>Customer Chain</th>
            <th>Document Chain</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in records" :key="row.id" @click="pickRecord(row)" class="clickable">
            <td>{{ row.record_ref }}</td>
            <td>{{ row.customer_provider }}{{ row.customer_tx_id ? ` (${row.customer_tx_id})` : '' }}</td>
            <td>{{ row.document_provider }}{{ row.document_tx_id ? ` (${row.document_tx_id})` : '' }}</td>
            <td>{{ new Date(row.created_at).toLocaleString() }}</td>
          </tr>
          <tr v-if="!records.length"><td colspan="4" class="empty">No records yet</td></tr>
        </tbody>
      </table></div>
    </section>
  </div>
</template>

<script>
import api from '../../services/api'

export default {
  name: 'AdminIntegrityRecords',
  data() {
    return {
      saving: false,
      verifying: false,
      createdRecord: null,
      verifyResult: null,
      records: [],
      verify: {
        recordRef: '',
        target: 'customer'
      },
      form: {
        customer: {
          name: '',
          email: '',
          address: ''
        },
        document: {
          mime_type: 'text/plain',
          filename: 'report.txt',
          text: '',
          content_base64: ''
        }
      }
    }
  },
  created() {
    this.loadRecords()
  },
  methods: {
    async createRecord() {
      this.saving = true
      this.createdRecord = null
      try {
        const payload = {
          customer: {
            name: this.form.customer.name,
            email: this.form.customer.email,
            address: this.form.customer.address
          },
          document: {
            filename: this.form.document.filename,
            mime_type: this.form.document.mime_type,
            text: this.form.document.mime_type === 'text/plain' ? this.form.document.text : undefined,
            content_base64: this.form.document.mime_type === 'application/pdf' ? this.form.document.content_base64 : undefined
          }
        }

        const { data } = await api.post('/admin/integrity/records', payload)
        this.createdRecord = data
        this.verify.recordRef = data.record_ref || ''
        await this.loadRecords()
      } catch (err) {
        alert(err?.response?.data?.message || 'Failed to create secured record')
      } finally {
        this.saving = false
      }
    },
    async verifyRecord() {
      if (!this.verify.recordRef) return
      this.verifying = true
      this.verifyResult = null
      try {
        const { data } = await api.get(`/admin/integrity/records/${encodeURIComponent(this.verify.recordRef)}/verify`, {
          params: { target: this.verify.target }
        })
        this.verifyResult = data
      } catch (err) {
        alert(err?.response?.data?.message || 'Failed to verify integrity')
      } finally {
        this.verifying = false
      }
    },
    async loadRecords() {
      try {
        const { data } = await api.get('/admin/integrity/records', { params: { limit: 50 } })
        this.records = Array.isArray(data) ? data : []
      } catch (err) {
        console.error('Failed to load integrity records', err)
      }
    },
    pickRecord(row) {
      this.verify.recordRef = row.record_ref
    }
  }
}
</script>

<style scoped>
.integrity-page{display:grid;gap:12px}
.panel{background:#fff;border-radius:8px;padding:12px;box-shadow:0 4px 14px rgba(56,92,35,.08)}
h2,h3{margin:0 0 8px}
.form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.form label{display:grid;gap:4px;font-size:12px;color:#5f6f53}
.form .full{grid-column:1/-1}
.verify-row{display:grid;grid-template-columns:1fr 180px auto;gap:8px}
.table{width:100%;border-collapse:collapse}
.table th,.table td{padding:8px;border-bottom:1px solid #e6eddc;text-align:left}
.table th{background:#f4f8ee}
.clickable{cursor:pointer}
.clickable:hover td{background:#f7fbf1}
.result{margin-top:8px;padding:8px;border-radius:6px;font-weight:600}
.result.ok{background:#edf8e3;color:#2f5a23}
.result.warn{background:#fff0ea;color:#8f3d1e}
.section-head{display:flex;justify-content:space-between;align-items:center;gap:8px}
.empty{text-align:center;color:#6f7d67}
input,select,textarea{border:1px solid #cddbb9;border-radius:6px;padding:8px;background:#fff}
button{background:linear-gradient(135deg,#7CB342,#4E7D32);color:#fff;border:none;padding:8px 12px;border-radius:6px;cursor:pointer}
button.secondary{background:#f8fbf4;color:#2f5a23;border:1px solid #cddbb9}
button:disabled{opacity:.6;cursor:not-allowed}
@media (max-width:900px){
  .form{grid-template-columns:1fr}
  .verify-row{grid-template-columns:1fr}
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
