<template>
  <div class="login-container">
    <div class="login-box">
      <div class="login-header">
        <div class="eyebrow">Secure Access</div>
        <h1>Kadiwa E-Commerce</h1>
        <h2>Store Owner Login</h2>
        <p class="subtext">Sign in with your store owner account.</p>
      </div>

      <form @submit.prevent="handleLogin" class="login-form">
        <div v-if="error" class="error-message">{{ error }}</div>

        <div class="form-group">
          <label for="username">Username</label>
          <input
            type="text"
            id="username"
            v-model="credentials.username"
            placeholder="Enter username"
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
        <a href="#" @click.prevent="showRegisterForm = true">Register as Store Owner</a>
      </div>

      <div v-if="showRegisterForm" class="register-modal">
        <div class="modal-content">
          <h3>Store Owner Registration</h3>
          <form @submit.prevent="handleRegister">
            <div class="form-group">
              <label>Username</label>
              <input type="text" v-model="registerData.username" required />
            </div>
            <div class="form-group">
              <label>Email</label>
              <input type="email" v-model="registerData.email" required />
            </div>
            <div class="form-group">
              <label>Password</label>
              <div class="password-field">
                <input
                  :type="showRegisterPassword ? 'text' : 'password'"
                  v-model="registerData.password"
                  required
                />
                <button
                  type="button"
                  class="toggle-password"
                  :aria-label="showRegisterPassword ? 'Hide password' : 'Show password'"
                  @click="showRegisterPassword = !showRegisterPassword"
                >
                  {{ showRegisterPassword ? 'Hide' : 'Show' }}
                </button>
              </div>
            </div>
            <div class="form-group">
              <label>Full Name</label>
              <input type="text" v-model="registerData.full_name" required />
            </div>
            <div class="form-group">
              <label>Store Name</label>
              <input type="text" v-model="registerData.store_name" required />
            </div>
            <div class="form-group">
              <label>Phone</label>
              <input type="tel" v-model="registerData.phone" />
            </div>
            <div class="form-group">
              <label>Address</label>
              <textarea v-model="registerData.address"></textarea>
            </div>
            <div class="modal-buttons">
              <button type="submit" class="btn-submit">Register</button>
              <button type="button" @click="showRegisterForm = false" class="btn-cancel">Cancel</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import api from '../services/api'
import { bindKeyboardScroll } from '../utils/keyboardScroll'

export default {
  name: 'StoreOwnerLogin',
  data() {
    return {
      credentials: {
        username: '',
        password: ''
      },
      showPassword: false,
      showRegisterPassword: false,
      unbindKeyboardScroll: null,
      registerData: {
        username: '',
        email: '',
        password: '',
        full_name: '',
        store_name: '',
        phone: '',
        address: ''
      },
      error: '',
      loading: false,
      showRegisterForm: false
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
        const response = await api.post('/admin/auth/login/store-owner', this.credentials)
        this.$store.dispatch('login', {
          user: response.data.user,
          token: response.data.token
        })
        const { recallPath } = await import('../services/routeMemory')
        this.$router.push(recallPath('store_owner', '/store-owner/dashboard'))
      } catch (err) {
        this.error = err.response?.data?.message || 'Login failed. Please try again.'
      } finally {
        this.loading = false
      }
    },
    async handleRegister() {
      try {
        const response = await api.post('/admin/auth/register/store-owner', this.registerData)
        alert(response.data.message)
        this.showRegisterForm = false
        this.registerData = {
          username: '',
          email: '',
          password: '',
          full_name: '',
          store_name: '',
          phone: '',
          address: ''
        }
      } catch (err) {
        alert(err.response?.data?.message || 'Registration failed')
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

.form-group input,
.form-group textarea {
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

.form-group textarea {
  min-height: 100px;
  resize: vertical;
}

.login-btn,
.btn-submit,
.btn-cancel {
  width: 100%;
  padding: 14px 18px;
  border: none;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
}

.login-btn {
  background: linear-gradient(135deg, #5a944a, #3e712e);
  color: #fff;
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

.register-modal {
  position: fixed;
  inset: 0;
  background: rgba(19, 48, 17, 0.45);
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 24px;
}

.modal-content {
  background: #ffffff;
  border-radius: 18px;
  padding: 28px;
  width: 100%;
  max-width: 520px;
  box-shadow: 0 18px 40px rgba(23, 59, 16, 0.18);
}

.modal-buttons {
  display: flex;
  gap: 12px;
  margin-top: 18px;
}

.btn-submit {
  background: #4b783e;
  color: #fff;
}

.btn-cancel {
  background: #dde5d2;
  color: #314427;
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
  .modal-content {
    max-height: min(85vh, 100%);
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
}
</style>
