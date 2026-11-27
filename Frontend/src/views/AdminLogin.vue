<template>
  <div class="login-container">
    <div class="login-box">
      <div class="login-header">
        <div class="eyebrow">Secure Access</div>
        <h1>Kadiwa E-Commerce</h1>
        <h2>{{ loginModeLabel }} Login</h2>
        <p class="subtext">Choose your account type and sign in.</p>
      </div>

      <div class="toggle-buttons">
        <button
          :class="{ active: loginMode === 'admin' }"
          type="button"
          @click="loginMode = 'admin'"
        >
          Admin
        </button>
        <button
          :class="{ active: loginMode === 'store_owner' }"
          type="button"
          @click="loginMode = 'store_owner'"
        >
          Store Owner
        </button>
        <button
          :class="{ active: loginMode === 'pos_user' }"
          type="button"
          @click="loginMode = 'pos_user'"
        >
          POS
        </button>
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
        <span v-if="loginMode === 'store_owner'"> | </span>
        <a
          v-if="loginMode === 'store_owner'"
          href="#"
          @click.prevent="showRegisterForm = true"
        >
          Register as Store Owner
        </a>
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
  name: 'AdminLogin',
  data() {
    return {
      credentials: {
        username: '',
        password: ''
      },
      loginMode: 'admin',
      showPassword: false,
      showRegisterPassword: false,
      error: '',
      loading: false,
      showRegisterForm: false,
      unbindKeyboardScroll: null,
      registerData: {
        username: '',
        email: '',
        password: '',
        full_name: '',
        store_name: '',
        phone: '',
        address: ''
      }
    }
  },
  computed: {
    loginModeLabel() {
      if (this.loginMode === 'store_owner') return 'Store Owner'
      if (this.loginMode === 'pos_user') return 'POS'
      return 'Admin'
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
        let endpoint = '/admin/auth/login/admin'
        let redirectRoute = '/admin/dashboard'

        if (this.loginMode === 'store_owner') {
          endpoint = '/admin/auth/login/store-owner'
          redirectRoute = '/store-owner/dashboard'
        } else if (this.loginMode === 'pos_user') {
          endpoint = '/pos/auth/login'
          redirectRoute = '/pos/dashboard'
        }

        const response = await api.post(endpoint, this.credentials)
        this.$store.dispatch('login', {
          user: response.data.user,
          token: response.data.token
        })
        const role = response.data.user?.role
          || (this.loginMode === 'store_owner' ? 'store_owner' : this.loginMode === 'pos_user' ? 'pos_user' : 'admin')
        const { recallPath } = await import('../services/routeMemory')
        this.$router.push(recallPath(role, redirectRoute))
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
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #4E7D32;
  background: #eaf2de;
  border: 1px solid #d5e4bf;
  border-radius: 999px;
  padding: 4px 10px;
  margin-bottom: 10px;
}

.login-header h1 {
  color: #355e2a;
  margin-bottom: 8px;
  font-size: 30px;
  line-height: 1.1;
}

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

.toggle-buttons {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  background: #f4f8ee;
  border: 1px solid #dce8cc;
  border-radius: 12px;
  padding: 4px;
}

.toggle-buttons button {
  flex: 1;
  padding: 10px 8px;
  border: none;
  background: transparent;
  color: #355e2a;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  transition: all 0.2s ease;
}

.toggle-buttons button.active {
  background: linear-gradient(135deg, #7CB342, #4E7D32);
  color: white;
  box-shadow: 0 6px 14px rgba(78, 125, 50, 0.26);
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

.form-group input,
.form-group textarea {
  width: 100%;
  padding: 12px 13px;
  border: 1px solid #cddbb9;
  border-radius: 10px;
  font-size: 14px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
  background: #fff;
}

.form-group input:focus,
.form-group textarea:focus {
  outline: none;
  border-color: #7CB342;
  box-shadow: 0 0 0 4px rgba(124, 179, 66, 0.2);
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
  resize: vertical;
  min-height: 80px;
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
  font-size: 14px;
}

.links a {
  color: #4E7D32;
  text-decoration: none;
}

.links a:hover {
  text-decoration: underline;
}

.register-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(15, 26, 10, 0.45);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  padding: 30px;
  border-radius: 16px;
  border: 1px solid #dce8cc;
  box-shadow: 0 10px 30px rgba(56, 92, 35, 0.2);
  max-width: 500px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-content h3 {
  margin-bottom: 20px;
  color: #355e2a;
  font-size: 22px;
}

.modal-buttons {
  display: flex;
  gap: 10px;
  margin-top: 20px;
}

.btn-submit {
  flex: 1;
  padding: 11px;
  background: linear-gradient(135deg, #7CB342, #4E7D32);
  color: white;
  border: none;
  border-radius: 10px;
  cursor: pointer;
}

.btn-cancel {
  flex: 1;
  padding: 11px;
  background: #eef2e7;
  color: #355e2a;
  border: none;
  border-radius: 10px;
  cursor: pointer;
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
