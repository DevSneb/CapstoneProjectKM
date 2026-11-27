<template>
  <div class="page">
    <h2>Settings • Profile</h2>
    <form class="form" @submit.prevent="save" novalidate>
      <label>Full name
        <input v-model.trim="form.full_name" required />
        <small v-if="errors.full_name" class="field-error">{{ errors.full_name }}</small>
      </label>
      <label>Phone
        <input v-model.trim="form.phone" placeholder="09XXXXXXXXX" />
        <small v-if="errors.phone" class="field-error">{{ errors.phone }}</small>
      </label>
      <label>Barangay
        <select v-model="barangay" required>
          <option disabled value="">Select barangay</option>
          <option v-for="b in barangays" :key="b" :value="b">{{ b }}</option>
        </select>
        <small v-if="errors.barangay" class="field-error">{{ errors.barangay }}</small>
      </label>
      <label>Street / landmark (optional)
        <input v-model.trim="street" placeholder="Street, house no., landmark" />
      </label>
      <button :disabled="saving">{{ saving ? 'Saving...' : 'Save' }}</button>
    </form>

    <h2 class="section-title">Change Email</h2>
    <form class="form" @submit.prevent="saveEmail">
      <label>Current Email
        <input :value="currentEmail" type="email" disabled />
      </label>
      <label>New Email
        <input v-model="emailForm.email" type="email" required />
      </label>
      <label>Current Password
        <input v-model="emailForm.current_password" type="password" required />
      </label>
      <button :disabled="savingEmail">{{ savingEmail ? 'Updating...' : 'Update Email' }}</button>
    </form>

    <h2 class="section-title">Change Password</h2>
    <form class="form" @submit.prevent="savePassword">
      <label>Current Password
        <input v-model="passwordForm.current_password" type="password" required />
      </label>
      <label>New Password
        <input v-model="passwordForm.new_password" type="password" minlength="6" required />
      </label>
      <label>Confirm New Password
        <input v-model="passwordForm.confirm_password" type="password" minlength="6" required />
      </label>
      <button :disabled="savingPassword">{{ savingPassword ? 'Updating...' : 'Update Password' }}</button>
    </form>
  </div>
</template>
<script>
import api from '../services/api'
import { readAuth } from '../services/authStorage'
import { BARANGAYS, splitAddress, joinAddress } from '../constants/barangays'

export default {
  name: 'CustomerSettings',
  data() {
    return {
      barangays: BARANGAYS,
      form: { full_name: '', phone: '', address: '' },
      barangay: '',
      street: '',
      errors: { full_name: '', phone: '', barangay: '' },
      currentEmail: '',
      emailForm: { email: '', current_password: '' },
      passwordForm: { current_password: '', new_password: '', confirm_password: '' },
      saving: false,
      savingEmail: false,
      savingPassword: false
    }
  },
  async created() {
    const { user } = readAuth('customer')
    if (user) {
      this.applyUser(user)
    }
    await this.loadProfile()
  },
  methods: {
    applyUser(user) {
      this.form.full_name = user.full_name || ''
      this.form.phone = user.phone || ''
      this.form.address = user.address || ''
      this.currentEmail = user.email || ''
      this.emailForm.email = user.email || ''
      const parts = splitAddress(user.address)
      this.barangay = parts.barangay
      this.street = parts.details
    },
    async loadProfile() {
      try {
        const { data } = await api.get('/customer/account/profile')
        const user = data?.user
        if (!user) return
        this.applyUser(user)
        this.$store.commit('SET_USER', user)
        localStorage.setItem('user', JSON.stringify(user))
      } catch (err) {
        console.error('Failed to load profile', err)
      }
    },
    validateProfile() {
      this.errors = { full_name: '', phone: '', barangay: '' }
      let ok = true
      if (!String(this.form.full_name || '').trim()) {
        this.errors.full_name = 'Full name is required.'
        ok = false
      }
      const phone = String(this.form.phone || '').trim()
      if (!phone) {
        this.errors.phone = 'Phone is required.'
        ok = false
      } else if (!/^09\d{9}$/.test(phone.replace(/\D/g, ''))) {
        this.errors.phone = 'Phone must be 11 digits and start with 09.'
        ok = false
      }
      if (!this.barangay) {
        this.errors.barangay = 'Please select your barangay.'
        ok = false
      }
      return ok
    },
    async save() {
      if (!this.validateProfile()) return
      this.saving = true
      try {
        this.form.address = joinAddress(this.barangay, this.street)
        const { data } = await api.put('/customer/account/profile', this.form)
        const { token } = readAuth('customer')
        this.$store.dispatch('login', { user: data.user, token })
        this.applyUser(data.user)
        alert('Profile updated')
      } catch (err) {
        alert(err.response?.data?.message || 'Failed to save')
      } finally {
        this.saving = false
      }
    },
    async saveEmail() {
      this.savingEmail = true
      try {
        const { data } = await api.put('/customer/account/email', {
          email: this.emailForm.email,
          current_password: this.emailForm.current_password
        })
        const { token } = readAuth('customer')
        this.$store.dispatch('login', { user: data.user, token })
        this.currentEmail = data.user.email || ''
        this.emailForm.email = data.user.email || ''
        this.emailForm.current_password = ''
        alert('Email updated')
      } catch (err) {
        const msg = err.response?.data?.message
          || err.response?.data?.errors?.map(e => e.msg).join(', ')
          || 'Failed to update email'
        alert(msg)
      } finally {
        this.savingEmail = false
      }
    },
    async savePassword() {
      if (this.passwordForm.new_password !== this.passwordForm.confirm_password) {
        alert('New password and confirmation do not match')
        return
      }
      this.savingPassword = true
      try {
        await api.put('/customer/account/password', {
          current_password: this.passwordForm.current_password,
          new_password: this.passwordForm.new_password
        })
        this.passwordForm = { current_password: '', new_password: '', confirm_password: '' }
        alert('Password updated')
      } catch (err) {
        const msg = err.response?.data?.message
          || err.response?.data?.errors?.map(e => e.msg).join(', ')
          || 'Failed to update password'
        alert(msg)
      } finally {
        this.savingPassword = false
      }
    }
  }
}
</script>
<style scoped>
.page { max-width: 560px; }
.section-title { margin-top: 28px; }
.form {
  display: grid;
  gap: 12px;
  background: #fff;
  padding: 14px;
  border-radius: 10px;
  box-shadow: 0 4px 14px rgba(56,92,35,.08);
  margin-bottom: 8px;
}
label { display: grid; gap: 6px; font-weight: 600; color: #355e2a; font-size: 13px; }
input, select, textarea {
  padding: 10px 12px;
  border: 1px solid #cddbb9;
  border-radius: 8px;
  font-weight: 500;
  min-height: 42px;
  box-sizing: border-box;
  width: 100%;
  background: #fff;
}
.field-error { color: #b42318; font-weight: 500; font-size: 12px; }
button {
  background: linear-gradient(135deg,#7CB342,#4E7D32);
  color: #fff;
  border: none;
  padding: 11px 14px;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 700;
  min-height: 44px;
}
button:disabled { opacity: .7; cursor: default; }
@media (max-width: 640px) {
  .page { max-width: 100%; }
  input, select { font-size: 16px; min-height: 44px; }
}
</style>
