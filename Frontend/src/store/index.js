import { createStore } from 'vuex'
import { clearAuth, readAuth, writeAuth } from '../services/authStorage'

const isVariableWeightUnit = unit =>
  /(^|[\s/.-])(kg|kgs|kilo|kilos|kilogram|kilograms|g|gram|grams|mg|milligram|lb|lbs|pound|pounds|oz|ounce|ounces)(?=$|[\s/.-])/i.test(String(unit || '').trim())

const initialRole = window.location.pathname.startsWith('/admin')
  ? 'admin'
  : window.location.pathname.startsWith('/store-owner')
    ? 'store_owner'
    : window.location.pathname.startsWith('/pos')
      ? 'pos_user'
      : window.location.pathname.startsWith('/customer')
        ? 'customer'
        : null
const initialAuth = readAuth(initialRole)

export default createStore({
  state: {
    user: initialAuth.user,
    token: initialAuth.token || null,
    isAuthenticated: !!initialAuth.token,
    cart: JSON.parse(localStorage.getItem('cart') || '[]').map(item => ({
      ...item,
      quantity: isVariableWeightUnit(item.unit) ? Number(item.quantity || 0.001) : 1
    }))
  },
  getters: {
    isAuthenticated: state => state.isAuthenticated,
    currentUser: state => state.user,
    userRole: state => state.user?.role || localStorage.getItem('userRole')
  },
  mutations: {
    SET_USER(state, user) {
      state.user = user
      state.isAuthenticated = true
    },
    SET_TOKEN(state, token) {
      state.token = token
      state.isAuthenticated = true
    },
    LOGOUT(state) {
      state.user = null
      state.token = null
      state.isAuthenticated = false
      clearAuth()
      localStorage.removeItem('cart')
    },
    ADD_TO_CART(state, item){
      const existing = state.cart.find(i=>i.product_id===item.product_id)
      if(existing){
        if (item.unit) existing.unit = item.unit
        existing.quantity = isVariableWeightUnit(existing.unit)
          ? Number(existing.quantity || 0) + Number(item.quantity || 0)
          : 1
      }
      else {
        state.cart.push({
          ...item,
          quantity: isVariableWeightUnit(item.unit) ? Number(item.quantity || 0.001) : 1
        })
      }
      localStorage.setItem('cart', JSON.stringify(state.cart))
    },
    UPDATE_CART_ITEM(state, { product_id, quantity }){
      const it = state.cart.find(i=>i.product_id===product_id)
      if(it){
        it.quantity = isVariableWeightUnit(it.unit) ? quantity : 1
      }
      state.cart = state.cart.filter(i=>i.quantity>0)
      localStorage.setItem('cart', JSON.stringify(state.cart))
    },
    CLEAR_CART(state){ state.cart = []; localStorage.setItem('cart', '[]') }
  },
  actions: {
    login({ commit }, { user, token }) {
      commit('SET_USER', user)
      commit('SET_TOKEN', token)
      writeAuth(user, token)
    },
    logout({ commit }) {
      commit('LOGOUT')
    },
    addToCart({ commit }, item){ commit('ADD_TO_CART', item) },
    updateCartItem({ commit }, payload){ commit('UPDATE_CART_ITEM', payload) },
    clearCart({ commit }){ commit('CLEAR_CART') }
  },
  modules: {}
})
