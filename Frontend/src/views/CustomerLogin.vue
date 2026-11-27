<template>
  <div class="login-container">
    <div class="login-box">
      <div class="login-header">
        <div class="eyebrow">Welcome</div>
        <router-link class="home-link" to="/">Kadiwa Mart</router-link>
        <h2>Customer Login</h2>
        <p class="subtext">Sign in to manage your orders and account.</p>
      </div>

      <form @submit.prevent="handleLogin" class="login-form" novalidate>
        <div v-if="error" class="error-message">{{ error }}</div>

        <div class="form-group" :class="{ invalid: fieldErrors.username }">
          <label for="username">Username</label>
          <input
            type="text"
            id="username"
            v-model.trim="credentials.username"
            placeholder="Enter username"
            autocomplete="username"
            :aria-invalid="!!fieldErrors.username"
            @blur="validateField('username')"
            @input="clearFieldError('username')"
          />
          <p v-if="fieldErrors.username" class="field-error">{{ fieldErrors.username }}</p>
        </div>

        <div class="form-group" :class="{ invalid: fieldErrors.password }">
          <label for="password">Password</label>
          <div class="password-field">
            <input
              :type="showPassword ? 'text' : 'password'"
              id="password"
              v-model="credentials.password"
              placeholder="Enter password"
              autocomplete="current-password"
              :aria-invalid="!!fieldErrors.password"
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

        <button type="submit" class="login-btn" :disabled="loading">
          {{ loading ? 'Logging in...' : 'Login' }}
        </button>
      </form>

      <div class="links">
        <p>Don't have an account? <router-link to="/customer/register">Register here</router-link></p>
        <p><router-link to="/">← Back to home</router-link></p>
      </div>
    </div>
  </div>
</template>

<script>
import api from '../services/api'
import { bindKeyboardScroll } from '../utils/keyboardScroll'

export default {
  name: 'CustomerLogin',
  data() {
    return {
      credentials: {
        username: '',
        password: ''
      },
      fieldErrors: {
        username: '',
        password: ''
      },
      showPassword: false,
      error: '',
      loading: false,
      unbindKeyboardScroll: null
    }
  },
  mounted() {
    this.unbindKeyboardScroll = bindKeyboardScroll(this.$el)
  },
  beforeUnmount() {
    if (this.unbindKeyboardScroll) this.unbindKeyboardScroll()
  },
  methods: {
    clearFieldError(field) {
      this.fieldErrors[field] = ''
    },
    validateField(field) {
      if (field === 'username') {
        const value = String(this.credentials.username || '').trim()
        if (!value) this.fieldErrors.username = 'Username is required.'
        else if (value.length < 3) this.fieldErrors.username = 'Username must be at least 3 characters.'
        else this.fieldErrors.username = ''
      }
      if (field === 'password') {
        const value = String(this.credentials.password || '')
        if (!value) this.fieldErrors.password = 'Password is required.'
        else this.fieldErrors.password = ''
      }
      return !this.fieldErrors[field]
    },
    validateForm() {
      const userOk = this.validateField('username')
      const passOk = this.validateField('password')
      return userOk && passOk
    },
    async handleLogin() {
      this.error = ''
      if (!this.validateForm()) return

      this.loading = true
      try {
        const response = await api.post('/customer/auth/login', {
          username: String(this.credentials.username || '').trim(),
          password: this.credentials.password
        })

        this.$store.dispatch('login', {
          user: response.data.user,
          token: response.data.token
        })

        this.$router.push(
          (await import('../services/routeMemory')).recallPath('customer', '/customer/dashboard')
        )
      } catch (err) {
        this.error = err.response?.data?.message || 'Login failed. Please try again.'
      } finally {
        this.loading = false
      }
    }
  }
}
</script>

<style scoped>
.login-container {
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

.login-container::before,
.login-container::after {
  content: '';
  position: absolute;
  border-radius: 999px;
  pointer-events: none;
}

.login-container::before {
  width: 280px;
  height: 280px;
  background: rgba(124, 179, 66, 0.18);
  top: -90px;
  left: -70px;
}

.login-container::after {
  width: 220px;
  height: 220px;
  background: rgba(53, 94, 42, 0.14);
  right: -60px;
  bottom: -60px;
}

.login-box {
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  padding: 36px;
  border-radius: 18px;
  border: 1px solid rgba(205, 219, 185, 0.9);
  box-shadow: 0 18px 40px rgba(56, 92, 35, 0.18);
  width: 100%;
  max-width: 420px;
  position: relative;
  z-index: 1;
  margin: auto 0;
}

.login-header {
  text-align: center;
  margin-bottom: 24px;
}

.eyebrow {
  display: block;
  width: fit-content;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #4E7D32;
  background: #eaf2de;
  border: 1px solid #d5e4bf;
  border-radius: 999px;
  padding: 4px 10px;
  margin: 0 auto 6px;
}

.home-link {
  display: block;
  color: #355e2a;
  text-decoration: none;
  font-size: 30px;
  font-weight: 700;
  line-height: 1.1;
  margin: 0 0 8px;
}
.home-link:hover { text-decoration: underline; }

.login-header h2 {
  color: #5f7256;
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}

.subtext {
  color: #6f7d67;
  margin: 8px 0 0;
  font-size: 13px;
}

.error-message {
  background: #fff1f1;
  color: #b42318;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid #f4c8c8;
  margin-bottom: 15px;
  text-align: center;
  font-size: 13px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 7px;
  color: #355e2a;
  font-weight: 600;
  font-size: 13px;
}

.form-group input {
  width: 100%;
  padding: 12px 13px;
  border: 1px solid #cddbb9;
  border-radius: 10px;
  font-size: 14px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  background: #fff;
  box-sizing: border-box;
}

.form-group input:focus {
  outline: none;
  border-color: #7CB342;
  box-shadow: 0 0 0 4px rgba(124, 179, 66, 0.2);
}

.form-group.invalid input {
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

.login-btn {
  width: 100%;
  margin-top: 6px;
  padding: 12px;
  background: linear-gradient(135deg, #7CB342, #4E7D32);
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease;
  box-shadow: 0 10px 20px rgba(78, 125, 50, 0.24);
  min-height: 44px;
}

.login-btn:hover:not(:disabled) {
  filter: brightness(1.02);
  transform: translateY(-1px);
}

.login-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.links {
  margin-top: 18px;
  text-align: center;
  color: #5f7256;
}

.links p {
  margin: 8px 0;
  font-size: 14px;
}

.links a {
  color: #4E7D32;
  text-decoration: none;
  font-weight: 500;
}

.links a:hover {
  text-decoration: underline;
}

@media (max-width: 640px) {
  .login-container {
    padding: 12px 12px 45vh;
    align-items: flex-start;
  }
  .login-box {
    margin-top: 8px;
    padding: 24px 16px;
  }
  .home-link { font-size: 26px; }
  .login-btn { width: 100%; min-height: 44px; }
  .form-group input { min-height: 44px; font-size: 16px; }
}
</style>
