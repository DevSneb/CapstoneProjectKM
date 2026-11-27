<template>
  <div class="profile-page">
    <h2>Account • Profile</h2>
    <form class="form" @submit.prevent="save">
      <label>Full Name<input v-model="form.full_name" required/></label>
      <label>Store Name<input v-model="form.store_name" required/></label>
      <label>Phone<input v-model="form.phone"/></label>
      <label>Address<textarea v-model="form.address"></textarea></label>
      <button type="submit">Save</button>
    </form>
    <p class="security-link">
      Need to update login details?
      <router-link :to="{ name: 'StoreAccountSecurity' }">Open security settings</router-link>
    </p>
  </div>
</template>
<script>
import api from '../../services/api'
export default {
  data(){return{form:{full_name:'',store_name:'',phone:'',address:''}}},
  async created(){ const {data}=await api.get('/store/account/me'); this.form=data||this.form },
  methods:{ async save(){ await api.put('/store/account/profile', this.form); alert('Profile updated'); localStorage.setItem('user', JSON.stringify({...JSON.parse(localStorage.getItem('user')), ...this.form})) } }
}
</script>
<style scoped>
.profile-page{max-width:520px}
.form{display:grid;gap:10px;background:#fff;padding:12px;border-radius:8px;box-shadow:0 4px 14px rgba(56,92,35,.08)}
label{display:flex;flex-direction:column;gap:6px}
input,textarea{padding:8px;border:1px solid #cddbb9;border-radius:6px}
button{background:linear-gradient(135deg,#7CB342,#4E7D32);color:#fff;border:none;padding:9px 12px;border-radius:6px;cursor:pointer}
.security-link{margin:14px 0 0;color:#5f7256;font-size:.92rem}
.security-link a{color:#355e2a;font-weight:600}
@media (max-width: 640px){
  .profile-page,.form{max-width:100%}
}
</style>
