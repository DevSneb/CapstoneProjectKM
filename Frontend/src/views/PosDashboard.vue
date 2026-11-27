<template>
  <div class="pos-shell">
    <header class="shell-bar">
      <div class="shell-meta">
        <span class="pill">REGISTER</span>
        <strong>{{ user.store_name || 'Store' }}</strong>
        <span class="sep">·</span>
        <span>{{ user.full_name || user.username || 'Cashier' }}</span>
      </div>
      <button type="button" class="logout-btn" @click="handleLogout">Sign out</button>
    </header>
    <main class="shell-body">
      <StorePOS />
    </main>
  </div>
</template>

<script>
import StorePOS from './store/POS.vue'
import { readAuth } from '../services/authStorage'

export default {
  name: 'PosDashboard',
  components: { StorePOS },
  computed: {
    user() {
      return readAuth('pos_user').user || {}
    }
  },
  methods: {
    handleLogout() {
      this.$store.dispatch('logout')
      this.$router.push('/pos/login')
    }
  }
}
</script>

<style scoped>
.pos-shell {
  min-height: 100vh;
  min-height: 100dvh;
  display: grid;
  grid-template-rows: auto 1fr;
  background: #0b1009;
  color: #eef4e8;
}
.shell-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  min-height: 44px;
  padding: 8px 14px;
  background: #12180f;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.shell-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 0.88rem;
  color: #a3b39a;
}
.shell-meta strong {
  color: #f2f7ec;
  font-size: 0.95rem;
}
.pill {
  display: inline-grid;
  place-items: center;
  min-height: 24px;
  padding: 0 8px;
  border-radius: 4px;
  background: #7cb342;
  color: #0d1609;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.08em;
}
.sep { opacity: 0.45; }
.logout-btn {
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  background: transparent;
  color: #e8f0e2;
  font-weight: 700;
  cursor: pointer;
}
.shell-body {
  min-height: 0;
  min-width: 0;
  width: 100%;
  max-width: 100%;
  padding: 10px;
  overflow-x: hidden;
}
@media (max-width: 760px) {
  .shell-bar {
    padding: 8px 10px;
  }
  .shell-body {
    padding: 8px 8px calc(8px + env(safe-area-inset-bottom, 0px));
  }
  .logout-btn {
    min-height: 40px;
  }
}
</style>
