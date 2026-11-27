<template>
  <div class="security-page">
    <header class="head">
      <h2>Account • Security</h2>
      <p class="lede">Login details stay hidden until you choose to change them.</p>
    </header>

    <section class="card">
      <div class="summary-row">
        <span>Signed in as</span>
        <strong>{{ maskedEmail(currentEmail) }}</strong>
      </div>

      <div class="toggles">
        <button type="button" class="ghost" :class="{ open: showEmailEditor }" @click="toggleEmail">
          {{ showEmailEditor ? 'Hide email change' : 'Change email' }}
        </button>
        <button type="button" class="ghost" :class="{ open: showPassEditor }" @click="togglePass">
          {{ showPassEditor ? 'Hide password change' : 'Change password' }}
        </button>
      </div>

      <form v-if="showEmailEditor" class="form" @submit.prevent="changeEmail">
        <p class="hint">Enter a new email and confirm with your current password.</p>
        <label>New Email<input type="email" v-model="emailForm.email" autocomplete="off" required placeholder="Enter new email" /></label>
        <label>Current Password<input type="password" v-model="emailForm.current_password" autocomplete="current-password" required placeholder="••••••••" /></label>
        <div class="actions">
          <button type="button" class="ghost" @click="cancelEmail">Cancel</button>
          <button type="submit" class="primary" :disabled="savingEmail">{{ savingEmail ? 'Updating...' : 'Save email' }}</button>
        </div>
      </form>

      <form v-if="showPassEditor" class="form" @submit.prevent="changePass">
        <p class="hint">Use at least 6 characters. Never share your password.</p>
        <label>Current Password<input type="password" v-model="f.current_password" autocomplete="current-password" required placeholder="••••••••" /></label>
        <label>New Password<input type="password" v-model="f.new_password" minlength="6" autocomplete="new-password" required placeholder="••••••••" /></label>
        <label>Confirm New Password<input type="password" v-model="f.confirm_password" minlength="6" autocomplete="new-password" required placeholder="••••••••" /></label>
        <div class="actions">
          <button type="button" class="ghost" @click="cancelPass">Cancel</button>
          <button type="submit" class="primary" :disabled="savingPass">{{ savingPass ? 'Updating...' : 'Save password' }}</button>
        </div>
      </form>
    </section>

    <p class="forgot">Forgot password? Contact an admin for a reset.</p>
  </div>
</template>
<script>
import api from '../../services/api'
export default {
  data() {
    return {
      currentEmail: '',
      emailForm: { email: '', current_password: '' },
      f: { current_password: '', new_password: '', confirm_password: '' },
      savingEmail: false,
      savingPass: false,
      showEmailEditor: false,
      showPassEditor: false
    }
  },
  async created() {
    try {
      const { data } = await api.get('/store/account/me')
      this.currentEmail = data?.email || ''
    } catch (err) {
      console.error('Failed to load account', err)
    }
  },
  methods: {
    maskedEmail(email) {
      const value = String(email || '').trim()
      if (!value || !value.includes('@')) return 'Not set'
      const [local, domain] = value.split('@')
      if (!local) return '••••@' + domain
      const visible = local.slice(0, Math.min(2, local.length))
      return `${visible}${'•'.repeat(Math.max(3, local.length - visible.length))}@${domain}`
    },
    toggleEmail() {
      this.showEmailEditor = !this.showEmailEditor
      if (this.showEmailEditor) {
        this.showPassEditor = false
        this.emailForm = { email: '', current_password: '' }
      } else this.cancelEmail()
    },
    togglePass() {
      this.showPassEditor = !this.showPassEditor
      if (this.showPassEditor) {
        this.showEmailEditor = false
        this.f = { current_password: '', new_password: '', confirm_password: '' }
      } else this.cancelPass()
    },
    cancelEmail() {
      this.showEmailEditor = false
      this.emailForm = { email: '', current_password: '' }
    },
    cancelPass() {
      this.showPassEditor = false
      this.f = { current_password: '', new_password: '', confirm_password: '' }
    },
    async changeEmail() {
      this.savingEmail = true
      try {
        const { data } = await api.put('/store/account/email', this.emailForm)
        this.currentEmail = data.user?.email || this.emailForm.email
        this.cancelEmail()
        const stored = JSON.parse(localStorage.getItem('user') || '{}')
        localStorage.setItem('user', JSON.stringify({ ...stored, email: this.currentEmail }))
        alert('Email updated')
      } catch (err) {
        alert(err.response?.data?.message || err.response?.data?.errors?.map(e => e.msg).join(', ') || 'Failed to update email')
      } finally {
        this.savingEmail = false
      }
    },
    async changePass() {
      if (this.f.new_password !== this.f.confirm_password) {
        alert('New password and confirmation do not match')
        return
      }
      this.savingPass = true
      try {
        await api.put('/store/account/password', {
          current_password: this.f.current_password,
          new_password: this.f.new_password
        })
        alert('Password updated')
        this.cancelPass()
      } catch (err) {
        alert(err.response?.data?.message || err.response?.data?.errors?.map(e => e.msg).join(', ') || 'Failed to update password')
      } finally {
        this.savingPass = false
      }
    }
  }
}
</script>
<style scoped>
.security-page{display:grid;gap:14px;max-width:520px}
.head h2{margin:0 0 4px}
.lede{margin:0;color:#5f7256;font-size:.95rem}
.card{background:#fff;padding:16px;border-radius:14px;border:1px solid #d9e8ca;box-shadow:0 8px 20px rgba(56,92,35,.08)}
.summary-row{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:12px;border-radius:12px;background:#f4f8ef}
.summary-row span{color:#5f7256;font-size:.86rem}
.summary-row strong{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#355e2a}
.toggles{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.form{display:grid;gap:10px;margin-top:14px;padding-top:14px;border-top:1px solid #e4ecd8}
.hint{margin:0;color:#5f7256;font-size:.88rem}
label{display:flex;flex-direction:column;gap:6px;font-size:.88rem;font-weight:600;color:#48603b}
input{padding:10px 12px;border:1px solid #cddbb9;border-radius:10px;min-height:44px;font:inherit}
.actions{display:flex;flex-wrap:wrap;gap:8px}
.primary,.ghost{min-height:44px;border-radius:10px;padding:0 14px;cursor:pointer;font-weight:600}
.primary{border:none;color:#fff;background:linear-gradient(135deg,#7CB342,#4E7D32)}
.ghost{border:1px solid #cddbb9;background:transparent;color:#355e2a}
.ghost.open{border-color:#7CB342;background:rgba(124,179,66,.12)}
.primary:disabled{opacity:.7;cursor:default}
.forgot{margin:0;color:#48603b;font-size:.9rem}
@media (max-width: 640px){
  .security-page{max-width:100%}
  .toggles,.actions{flex-direction:column}
  .toggles .ghost,.actions button{width:100%}
}
</style>
