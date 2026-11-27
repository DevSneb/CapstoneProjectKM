<template>
  <div class="login-container">
    <div class="login-box">
      <div class="login-header">
        <div class="eyebrow">Secure Access</div>
        <h1>Kadiwa E-Commerce</h1>
        <h2>POS Login</h2>
        <p class="subtext">Sign in with your POS email and password.</p>
      </div>

      <form @submit.prevent="handleLogin" class="login-form">
        <div v-if="error" class="error-message">{{ error }}</div>

        <div class="form-group">
          <label for="email">Email</label>
          <input
            type="email"
            id="email"
            v-model.trim="credentials.email"
            placeholder="Enter POS email"
            autocomplete="username"
            required
          />
        </div>

        <div class="form-group">
          <label for="password">Password</label>
          <div class="password-field">
            <input
              :type="showPassword ? 'text' : 'password'"
              id="password"
              v-model="credentials.password"
              placeholder="Enter password"
              required
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
        </div>

        <button type="submit" class="login-btn" :disabled="loading">
          {{ loading ? 'Logging in...' : 'Login' }}
        </button>
      </form>

      <div class="links">
        <router-link to="/customer/login">Customer Login</router-link>
        <span> | </span>
        <router-link to="/admin/login">Admin Login</router-link>
        <span> | </span>
        <router-link to="/store-owner/login">Store Owner Login</router-link>
      </div>
    </div>
  </div>
</template>

<script>
import api from '../services/api'
import { bindKeyboardScroll } from '../utils/keyboardScroll'

export default {
  name: 'PosLogin',
  data() {
    return {
      credentials: {
        email: '',
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
    async handleLogin() {
      this.error = ''
      this.loading = true

      try {
        const response = await api.post('/pos/auth/login', {
          email: String(this.credentials.email || '').trim().toLowerCase(),
          password: String(this.credentials.password || '')
        })
        this.$store.dispatch('login', {
          user: response.data.user,
          token: response.data.token
        })
        this.$router.push('/pos/dashboard')
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
  width: 300px;
  height: 300px;
  background: rgba(124, 179, 66, 0.16);
  top: -100px;
  left: -90px;
}

.login-container::after {
  width: 220px;
  height: 220px;
  background: rgba(53, 94, 42, 0.12);
  right: -70px;
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
  max-width: 430px;
  position: relative;
  z-index: 1;
  margin: auto 0;
}

.login-header {
  text-align: center;
  margin-bottom: 24px;
}

.eyebrow {
  display: inline-block;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 1px;
  color: #5a7e45;
  text-transform: uppercase;
  margin-bottom: 8px;
}

.login-header h1 {
  margin: 0;
  font-size: 28px;
  color: #2f5f28;
}

.login-header h2 {
  margin: 12px 0 8px;
  font-size: 20px;
  color: #385e2f;
}

.subtext {
  margin: 0;
  color: #5f6f55;
}

.login-form {
  display: grid;
  gap: 18px;
}

.form-group {
  display: flex;
  flex-direction: column;
}

.form-group label {
  margin-bottom: 6px;
  font-weight: 600;
  color: #465f3d;
}

.form-group input {
  padding: 12px 14px;
  border: 1px solid #c9d1b9;
  border-radius: 12px;
  font-size: 14px;
  color: #2f3f24;
  background: #f8faf3;
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
}
.toggle-password:hover {
  background: rgba(124, 179, 66, 0.12);
}

.login-btn {
  background: linear-gradient(135deg, #5a944a, #3e712e);
  color: #fff;
  width: 100%;
  padding: 14px 18px;
  border: none;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
}

.login-btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.links {
  margin-top: 18px;
  display: flex;
  justify-content: center;
  gap: 6px;
  flex-wrap: wrap;
}

.links a,
.links router-link {
  color: #4b783e;
  text-decoration: none;
  font-weight: 600;
}

.error-message {
  padding: 12px 14px;
  background: #ffe8e3;
  border: 1px solid #f2b0a1;
  color: #8a2e24;
  border-radius: 12px;
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
  .login-btn { min-height: 44px; }
}
</style>
