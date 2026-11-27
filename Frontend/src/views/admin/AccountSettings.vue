<template>
  <div class="settings-page">
    <h2>Account Settings</h2>

    <div class="card">
      <div class="row"><span>Username</span><strong>{{ user.username }}</strong></div>
      <div class="row"><span>Email</span><strong>{{ maskedEmail(user.email) }}</strong></div>
      <div class="row"><span>Full Name</span><strong>{{ user.full_name }}</strong></div>
      <div class="row"><span>Role</span><strong>{{ user.role }}</strong></div>
    </div>

    <div class="card security-card">
      <h3>Login &amp; security</h3>
      <p class="lede">Email and password stay hidden until you open a change form.</p>
      <div class="toggles">
        <button type="button" class="ghost" :class="{ open: showEmailEditor }" @click="toggleEmail">
          {{ showEmailEditor ? 'Hide email change' : 'Change email' }}
        </button>
        <button type="button" class="ghost" :class="{ open: showPasswordEditor }" @click="togglePassword">
          {{ showPasswordEditor ? 'Hide password change' : 'Change password' }}
        </button>
      </div>

      <form v-if="showEmailEditor" class="form nested" @submit.prevent="changeEmail">
        <p class="hint">Enter a new email and confirm with your current password.</p>
        <label>New Email
          <input v-model="emailForm.email" type="email" autocomplete="off" required placeholder="Enter new email" />
        </label>
        <label>Current Password
          <input v-model="emailForm.current_password" type="password" autocomplete="current-password" required placeholder="••••••••" />
        </label>
        <div class="actions">
          <button type="button" class="ghost" @click="cancelEmail">Cancel</button>
          <button type="submit" class="primary" :disabled="savingEmail">{{ savingEmail ? 'Updating...' : 'Save email' }}</button>
        </div>
      </form>

      <form v-if="showPasswordEditor" class="form nested" @submit.prevent="changePassword">
        <p class="hint">Use at least 6 characters.</p>
        <label>Current Password
          <input v-model="passwordForm.current_password" type="password" autocomplete="current-password" required placeholder="••••••••" />
        </label>
        <label>New Password
          <input v-model="passwordForm.new_password" type="password" minlength="6" autocomplete="new-password" required placeholder="••••••••" />
        </label>
        <label>Confirm New Password
          <input v-model="passwordForm.confirm_password" type="password" minlength="6" autocomplete="new-password" required placeholder="••••••••" />
        </label>
        <div class="actions">
          <button type="button" class="ghost" @click="cancelPassword">Cancel</button>
          <button type="submit" class="primary" :disabled="savingPassword">{{ savingPassword ? 'Updating...' : 'Save password' }}</button>
        </div>
      </form>
    </div>
  </div>
</template>
<script>
import api from '../../services/api'
export default {
  name: 'AdminAccountSettings',
  data() {
    return {
      user: {},
      emailForm: { email: '', current_password: '' },
      passwordForm: { current_password: '', new_password: '', confirm_password: '' },
      savingEmail: false,
      savingPassword: false,
      showEmailEditor: false,
      showPasswordEditor: false
    }
  },
  async created() {
    await this.loadUser()
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
        this.showPasswordEditor = false
        this.emailForm = { email: '', current_password: '' }
      } else this.cancelEmail()
    },
    togglePassword() {
      this.showPasswordEditor = !this.showPasswordEditor
      if (this.showPasswordEditor) {
        this.showEmailEditor = false
        this.passwordForm = { current_password: '', new_password: '', confirm_password: '' }
      } else this.cancelPassword()
    },
    cancelEmail() {
      this.showEmailEditor = false
      this.emailForm = { email: '', current_password: '' }
    },
    cancelPassword() {
      this.showPasswordEditor = false
      this.passwordForm = { current_password: '', new_password: '', confirm_password: '' }
    },
    async loadUser() {
      const { data } = await api.get('/admin/account/me')
      this.user = data
    },
    async changeEmail() {
      this.savingEmail = true
      try {
        const { data } = await api.put('/admin/account/email', this.emailForm)
        this.user = data.user || this.user
        this.cancelEmail()
        const stored = JSON.parse(localStorage.getItem('user') || '{}')
        localStorage.setItem('user', JSON.stringify({ ...stored, email: this.user.email }))
        alert('Email updated')
      } catch (err) {
        alert(err.response?.data?.message || err.response?.data?.errors?.map(e => e.msg).join(', ') || 'Failed to update email')
      } finally {
        this.savingEmail = false
      }
    },
    async changePassword() {
      if (this.passwordForm.new_password !== this.passwordForm.confirm_password) {
        alert('New password and confirmation do not match')
        return
      }
      this.savingPassword = true
      try {
        await api.put('/admin/account/password', {
          current_password: this.passwordForm.current_password,
          new_password: this.passwordForm.new_password
        })
        this.cancelPassword()
        alert('Password updated')
      } catch (err) {
        alert(err.response?.data?.message || err.response?.data?.errors?.map(e => e.msg).join(', ') || 'Failed to update password')
      } finally {
        this.savingPassword = false
      }
    }
  }
}
</script>
<style scoped>
.settings-page{display:grid;gap:12px;max-width:560px}
.settings-page h2{margin:0}
.card{background:#fff;border:1px solid #deead0;border-radius:14px;padding:16px;box-shadow:0 10px 24px rgba(56,92,35,.1)}
.row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #e6eddc}
.row:last-child{border-bottom:none}
.row span{color:#5f7256;font-size:13px}
.row strong{color:#2f5a23;text-align:right}
.security-card h3{margin:0 0 4px;color:#355e2a;font-size:15px}
.lede{margin:0 0 12px;color:#5f7256;font-size:.9rem}
.toggles{display:flex;flex-wrap:wrap;gap:8px}
.form.nested{display:grid;gap:10px;margin-top:14px;padding-top:14px;border-top:1px solid #e6eddc}
.hint{margin:0;color:#5f7256;font-size:.88rem}
label{display:flex;flex-direction:column;gap:6px;color:#5f7256;font-size:13px}
input{padding:10px 12px;border:1px solid #cddbb9;border-radius:8px;min-height:44px;font:inherit}
.actions{display:flex;flex-wrap:wrap;gap:8px}
.primary,.ghost{min-height:44px;border-radius:8px;padding:0 14px;cursor:pointer;font-weight:600}
.primary{background:linear-gradient(135deg,#7CB342,#4E7D32);color:#fff;border:none}
.ghost{border:1px solid #cddbb9;background:transparent;color:#355e2a}
.ghost.open{border-color:#7CB342;background:rgba(124,179,66,.12)}
.primary:disabled{opacity:.7;cursor:default}
@media (max-width: 640px){
  .settings-page,.card{max-width:100%}
  .toggles,.actions{flex-direction:column}
  .toggles .ghost,.actions button{width:100%}
}
</style>
