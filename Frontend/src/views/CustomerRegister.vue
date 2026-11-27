<template>
  <div class="register-container">
    <div class="register-box">
      <div class="register-header">
        <router-link class="home-link" to="/">Kadiwa Mart</router-link>
        <h2>{{ step === 'form' ? 'Customer Registration' : 'Verify Email' }}</h2>
        <p v-if="step === 'otp'" class="subtext">
          Enter the 6-digit code sent to <strong>{{ pendingEmail }}</strong>
        </p>
      </div>

      <form v-if="step === 'form'" @submit.prevent="handleRegister" class="register-form" novalidate>
        <div v-if="error" class="error-message">{{ error }}</div>
        <div v-if="success" class="success-message">{{ success }}</div>

        <div class="form-group" :class="{ invalid: fieldErrors.username }">
          <label for="username">Username *</label>
          <input
            type="text"
            id="username"
            v-model.trim="formData.username"
            placeholder="Choose a username"
            autocomplete="username"
            @blur="validateField('username')"
            @input="clearFieldError('username')"
          />
          <p v-if="fieldErrors.username" class="field-error">{{ fieldErrors.username }}</p>
        </div>

        <div class="form-group" :class="{ invalid: fieldErrors.email }">
          <label for="email">Email *</label>
          <input
            type="email"
            id="email"
            v-model.trim="formData.email"
            placeholder="Enter your email"
            autocomplete="email"
            @blur="validateField('email')"
            @input="clearFieldError('email')"
          />
          <p v-if="fieldErrors.email" class="field-error">{{ fieldErrors.email }}</p>
        </div>

        <div class="form-group" :class="{ invalid: fieldErrors.password }">
          <label for="password">Password *</label>
          <div class="password-field">
            <input
              :type="showPassword ? 'text' : 'password'"
              id="password"
              v-model="formData.password"
              placeholder="Min 8 chars: letters, numbers, special"
              autocomplete="new-password"
              @blur="validateField('password')"
              @input="clearFieldError('password')"
            />
            <button
              type="button"
              class="toggle-password"
              :aria-label="showPassword ? 'Hide password' : 'Show password'"
              @click="showPassword = !showPassword"
            >
              {{ showPassword ? 'Hide' : 'Show' }}
            </button>
          </div>
          <p v-if="fieldErrors.password" class="field-error">{{ fieldErrors.password }}</p>
        </div>

        <div class="form-group" :class="{ invalid: fieldErrors.full_name }">
          <label for="full_name">Full Name *</label>
          <input
            type="text"
            id="full_name"
            v-model.trim="formData.full_name"
            placeholder="Enter your full name"
            autocomplete="name"
            @blur="validateField('full_name')"
            @input="clearFieldError('full_name')"
          />
          <p v-if="fieldErrors.full_name" class="field-error">{{ fieldErrors.full_name }}</p>
        </div>

        <div class="form-group" :class="{ invalid: fieldErrors.phone }">
          <label for="phone">Phone *</label>
          <input
            type="tel"
            id="phone"
            inputmode="numeric"
            maxlength="11"
            v-model="formData.phone"
            placeholder="09XXXXXXXXX"
            autocomplete="tel"
            @input="onPhoneInput"
            @blur="validateField('phone')"
          />
          <p v-if="fieldErrors.phone" class="field-error">{{ fieldErrors.phone }}</p>
        </div>

        <div class="form-group" :class="{ invalid: fieldErrors.barangay }">
          <label for="barangay">Barangay *</label>
          <select
            id="barangay"
            v-model="formData.barangay"
            @change="clearFieldError('barangay')"
            @blur="validateField('barangay')"
          >
            <option disabled value="">Select barangay</option>
            <option v-for="b in barangays" :key="b" :value="b">{{ b }}</option>
          </select>
          <p v-if="fieldErrors.barangay" class="field-error">{{ fieldErrors.barangay }}</p>
        </div>

        <div class="form-group">
          <label for="street">Street / landmark (optional)</label>
          <input
            type="text"
            id="street"
            v-model.trim="formData.street"
            placeholder="Street, house no., landmark"
          />
        </div>

        <div class="consent-group" :class="{ invalid: fieldErrors.terms }">
          <label class="consent-label" for="agree_terms">
            <input
              id="agree_terms"
              type="checkbox"
              v-model="agreedToTerms"
              @change="clearFieldError('terms')"
            />
            <span>
              I agree to the
              <button type="button" class="link-btn" @click="showTerms = true">Terms and Conditions</button>
              and
              <button type="button" class="link-btn" @click="showTerms = true">Data Privacy policy</button>.
            </span>
          </label>
          <p v-if="fieldErrors.terms" class="field-error">{{ fieldErrors.terms }}</p>
        </div>

        <button type="submit" class="register-btn" :disabled="loading">
          {{ loading ? 'Sending code...' : 'Continue' }}
        </button>
      </form>

      <form v-else @submit.prevent="handleVerifyOtp" class="register-form" novalidate>
        <div v-if="error" class="error-message">{{ error }}</div>
        <div v-if="success" class="success-message">{{ success }}</div>

        <div class="form-group" :class="{ invalid: fieldErrors.otp }">
          <label for="otp">Verification code *</label>
          <input
            type="text"
            id="otp"
            inputmode="numeric"
            maxlength="6"
            v-model="otpCode"
            placeholder="6-digit code"
            autocomplete="one-time-code"
            @input="onOtpInput"
            @blur="validateField('otp')"
          />
          <p v-if="fieldErrors.otp" class="field-error">{{ fieldErrors.otp }}</p>
        </div>

        <button type="submit" class="register-btn" :disabled="loading">
          {{ loading ? 'Verifying...' : 'Verify & create account' }}
        </button>

        <div class="otp-actions">
          <button type="button" class="ghost-btn" :disabled="loading || resendCooldown > 0" @click="resendOtp">
            {{ resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code' }}
          </button>
          <button type="button" class="link-btn" :disabled="loading" @click="backToForm">Edit details</button>
        </div>
      </form>

      <div class="links">
        <p>Already have an account? <router-link to="/customer/login">Login here</router-link></p>
        <p><router-link to="/">← Back to home</router-link></p>
      </div>

      <div v-if="showTerms">
        <div class="modal-backdrop" @click="showTerms = false"></div>
        <div class="terms-modal" role="dialog" aria-modal="true" aria-label="Terms and Conditions">
          <h3>Terms and Conditions & Data Privacy</h3>
          <div class="terms-body">
            <p>By creating an account, you agree to use Kadiwa E-Commerce responsibly and provide accurate information.</p>
            <p>Your account credentials are your responsibility. Keep your password secure and do not share access with others.</p>
            <p>We collect the registration details you provide (such as name, email, phone, and address) to create and manage your account and process your orders.</p>
            <p>Your data is used only for platform operations, customer service, and transaction records. We do not sell your personal data.</p>
            <p>You may request updates to your profile details through your account settings or by contacting support.</p>
          </div>
          <div class="modal-actions">
            <button type="button" class="register-btn" @click="showTerms = false">Close</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import api from '../services/api'
import { bindKeyboardScroll } from '../utils/keyboardScroll'
import { BARANGAYS, joinAddress } from '../constants/barangays'

const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/
const PHONE_RULE = /^09\d{9}$/

const emptyErrors = () => ({
  username: '',
  email: '',
  password: '',
  full_name: '',
  phone: '',
  barangay: '',
  terms: '',
  otp: ''
})

export default {
  name: 'CustomerRegister',
  data() {
    return {
      step: 'form',
      barangays: BARANGAYS,
      formData: {
        username: '',
        email: '',
        password: '',
        full_name: '',
        phone: '',
        barangay: '',
        street: ''
      },
      pendingEmail: '',
      otpCode: '',
      fieldErrors: emptyErrors(),
      showPassword: false,
      error: '',
      success: '',
      loading: false,
      agreedToTerms: false,
      showTerms: false,
      resendCooldown: 0,
      resendTimer: null,
      unbindKeyboardScroll: null
    }
  },
  mounted() {
    this.unbindKeyboardScroll = bindKeyboardScroll(this.$el)
  },
  beforeUnmount() {
    if (this.unbindKeyboardScroll) this.unbindKeyboardScroll()
    if (this.resendTimer) clearInterval(this.resendTimer)
  },
  methods: {
    clearFieldError(field) {
      this.fieldErrors[field] = ''
    },
    onPhoneInput(event) {
      const digits = String(event.target.value || '').replace(/\D/g, '').slice(0, 11)
      this.formData.phone = digits
      this.clearFieldError('phone')
    },
    onOtpInput(event) {
      this.otpCode = String(event.target.value || '').replace(/\D/g, '').slice(0, 6)
      this.clearFieldError('otp')
    },
    startResendCooldown(seconds = 60) {
      this.resendCooldown = seconds
      if (this.resendTimer) clearInterval(this.resendTimer)
      this.resendTimer = setInterval(() => {
        if (this.resendCooldown <= 1) {
          this.resendCooldown = 0
          clearInterval(this.resendTimer)
          this.resendTimer = null
          return
        }
        this.resendCooldown -= 1
      }, 1000)
    },
    validateField(field) {
      if (field === 'username') {
        const value = String(this.formData.username || '').trim()
        if (!value) this.fieldErrors.username = 'Username is required.'
        else if (value.length < 3) this.fieldErrors.username = 'Username must be at least 3 characters.'
        else this.fieldErrors.username = ''
      }
      if (field === 'email') {
        const value = String(this.formData.email || '').trim()
        if (!value) this.fieldErrors.email = 'Email is required.'
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) this.fieldErrors.email = 'Enter a valid email address.'
        else this.fieldErrors.email = ''
      }
      if (field === 'password') {
        const value = String(this.formData.password || '')
        if (!value) this.fieldErrors.password = 'Password is required.'
        else if (!PASSWORD_RULE.test(value)) {
          this.fieldErrors.password = 'Use at least 8 characters with letters, numbers, and a special character.'
        } else this.fieldErrors.password = ''
      }
      if (field === 'full_name') {
        const value = String(this.formData.full_name || '').trim()
        if (!value) this.fieldErrors.full_name = 'Full name is required.'
        else this.fieldErrors.full_name = ''
      }
      if (field === 'phone') {
        const value = String(this.formData.phone || '')
        if (!value) this.fieldErrors.phone = 'Phone is required.'
        else if (!PHONE_RULE.test(value)) this.fieldErrors.phone = 'Phone must be 11 digits and start with 09.'
        else this.fieldErrors.phone = ''
      }
      if (field === 'barangay') {
        if (!this.formData.barangay) this.fieldErrors.barangay = 'Please select your barangay.'
        else this.fieldErrors.barangay = ''
      }
      if (field === 'terms') {
        if (!this.agreedToTerms) this.fieldErrors.terms = 'Please agree to the Terms and Data Privacy policy.'
        else this.fieldErrors.terms = ''
      }
      if (field === 'otp') {
        if (!/^\d{6}$/.test(String(this.otpCode || ''))) this.fieldErrors.otp = 'Enter the 6-digit code from your email.'
        else this.fieldErrors.otp = ''
      }
      return !this.fieldErrors[field]
    },
    validateForm() {
      const fields = ['username', 'email', 'password', 'full_name', 'phone', 'barangay', 'terms']
      return fields.every((field) => this.validateField(field))
    },
    async handleRegister() {
      this.error = ''
      this.success = ''
      if (!this.validateForm()) return

      this.loading = true
      try {
        const payload = {
          username: String(this.formData.username || '').trim(),
          email: String(this.formData.email || '').trim().toLowerCase(),
          password: this.formData.password,
          full_name: String(this.formData.full_name || '').trim(),
          phone: String(this.formData.phone || ''),
          address: joinAddress(this.formData.barangay, this.formData.street)
        }
        const { data } = await api.post('/customer/auth/register', payload)
        this.pendingEmail = data.email || payload.email
        this.step = 'otp'
        this.otpCode = ''
        this.success = data.message || 'Verification code sent to your email.'
        this.startResendCooldown(60)
      } catch (err) {
        let message = err.response?.data?.message
        if (!message && Array.isArray(err.response?.data?.errors)) {
          message = err.response.data.errors.map(error => error.msg).join('; ')
        }
        this.error = message || 'Registration failed. Please try again.'
      } finally {
        this.loading = false
      }
    },
    async handleVerifyOtp() {
      this.error = ''
      this.success = ''
      if (!this.validateField('otp')) return

      this.loading = true
      try {
        const { data } = await api.post('/customer/auth/register/verify-otp', {
          email: this.pendingEmail,
          otp: this.otpCode
        })
        this.success = data.message || 'Email verified. Account created.'
        setTimeout(() => {
          this.$router.push('/customer/login')
        }, 1500)
      } catch (err) {
        this.error = err.response?.data?.message || 'Invalid or expired code.'
      } finally {
        this.loading = false
      }
    },
    async resendOtp() {
      if (this.resendCooldown > 0 || !this.pendingEmail) return
      this.error = ''
      this.loading = true
      try {
        const { data } = await api.post('/customer/auth/register/resend-otp', {
          email: this.pendingEmail
        })
        this.success = data.message || 'A new code was sent.'
        this.startResendCooldown(60)
      } catch (err) {
        this.error = err.response?.data?.message || 'Could not resend code.'
      } finally {
        this.loading = false
      }
    },
    backToForm() {
      this.step = 'form'
      this.otpCode = ''
      this.error = ''
      this.success = ''
      this.fieldErrors.otp = ''
    }
  }
}
</script>

<style scoped>
.register-container {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  min-height: 100vh;
  min-height: 100dvh;
  background: radial-gradient(circle at 15% 15%, rgba(124, 179, 66, 0.3), transparent 45%),
              radial-gradient(circle at 85% 85%, rgba(78, 125, 50, 0.26), transparent 42%),
              linear-gradient(135deg, #edf5e2 0%, #d9e7c7 100%);
  padding: max(20px, env(safe-area-inset-top)) 20px max(24px, env(safe-area-inset-bottom));
  position: relative;
  overflow-x: hidden;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.register-box {
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  padding: 36px;
  border-radius: 18px;
  border: 1px solid rgba(205, 219, 185, 0.9);
  box-shadow: 0 18px 40px rgba(56, 92, 35, 0.18);
  width: 100%;
  max-width: 560px;
  position: relative;
  z-index: 1;
  margin: auto 0;
}

.register-header {
  text-align: center;
  margin-bottom: 24px;
}

.home-link {
  display: inline-block;
  color: #355e2a;
  text-decoration: none;
  font-size: 30px;
  font-weight: 700;
  line-height: 1.1;
  margin-bottom: 8px;
}
.home-link:hover { text-decoration: underline; }

.register-header h2 {
  color: #5f7256;
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}

.subtext {
  margin: 8px 0 0;
  color: #6f7d67;
  font-size: 13px;
  line-height: 1.4;
}

.error-message {
  background: #fff0ed;
  color: #a94432;
  padding: 10px;
  border-radius: 8px;
  margin-bottom: 15px;
  text-align: center;
}

.success-message {
  background: #eaf5df;
  color: #3f762a;
  padding: 10px;
  border-radius: 8px;
  margin-bottom: 15px;
  text-align: center;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 5px;
  color: #355e2a;
  font-weight: 500;
}

.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 12px;
  border: 1px solid #cddbb9;
  border-radius: 10px;
  font-size: 14px;
  transition: border-color 0.3s;
  background: #fff;
  box-sizing: border-box;
}

.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #7cb342;
  box-shadow: 0 0 0 3px rgba(124, 179, 66, 0.15);
}

.form-group.invalid input,
.form-group.invalid select {
  border-color: #e07a6c;
  box-shadow: 0 0 0 3px rgba(180, 35, 24, 0.12);
}

.field-error {
  margin: 6px 0 0;
  color: #b42318;
  font-size: 12px;
  line-height: 1.35;
}

.password-field {
  position: relative;
  display: flex;
  align-items: center;
}
.password-field input {
  width: 100%;
  padding-right: 64px;
}
.toggle-password {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  border: none;
  background: transparent;
  color: #4E7D32;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  padding: 6px 8px;
  border-radius: 8px;
  min-height: 36px;
}
.toggle-password:hover {
  background: rgba(124, 179, 66, 0.12);
}

.consent-group {
  margin-bottom: 20px;
}

.consent-label {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  color: #5f7256;
  font-size: 14px;
  line-height: 1.4;
}

.consent-label input[type="checkbox"] {
  width: auto;
  margin-top: 2px;
  min-width: 18px;
  min-height: 18px;
}

.link-btn {
  background: none;
  border: none;
  color: #4e7d32;
  text-decoration: underline;
  padding: 0;
  margin: 0;
  cursor: pointer;
  font: inherit;
}

.otp-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: space-between;
  align-items: center;
  margin-top: 12px;
}

.ghost-btn {
  border: 1px solid #cddbb9;
  background: #f7faf2;
  color: #355e2a;
  border-radius: 10px;
  padding: 10px 12px;
  cursor: pointer;
  font-weight: 600;
  min-height: 44px;
}
.ghost-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 1000;
}

.terms-modal {
  position: fixed;
  z-index: 1001;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(560px, calc(100vw - 24px));
  max-height: 80vh;
  overflow: auto;
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
  padding: 18px;
}

.terms-modal h3 {
  margin: 0 0 12px;
  color: #333;
}

.terms-body {
  color: #444;
  font-size: 14px;
  line-height: 1.5;
}

.modal-actions {
  margin-top: 14px;
}

.register-btn {
  width: 100%;
  padding: 12px;
  background: linear-gradient(135deg, #7cb342, #4e7d32);
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 16px;
  cursor: pointer;
  min-height: 44px;
}

.register-btn:hover:not(:disabled) {
  filter: brightness(0.95);
}

.register-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.links {
  margin-top: 20px;
  text-align: center;
  color: #6f7d67;
}

.links p {
  margin: 10px 0;
}

.links a {
  color: #4e7d32;
  text-decoration: none;
  font-weight: 500;
}

.links a:hover {
  text-decoration: underline;
}

@media (max-width: 640px) {
  .register-container {
    padding: 12px 12px 45vh;
    align-items: flex-start;
  }
  .register-box {
    margin-top: 8px;
    padding: 20px 16px;
    border-radius: 14px;
  }
  .home-link { font-size: 26px; }
  .register-btn, .ghost-btn { width: 100%; min-height: 44px; }
  .otp-actions { flex-direction: column; align-items: stretch; }
  .form-group input,
  .form-group select {
    min-height: 44px;
    font-size: 16px;
  }
}
</style>
