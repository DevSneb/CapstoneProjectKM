import axios from 'axios'
import { getRoleFromPath, readAuth } from './authStorage'

const api = axios.create({
  baseURL: process.env.VUE_APP_API_URL || '/api',
  headers: {
    'Content-Type': 'application/json'
  }
})

// Add token to requests
api.interceptors.request.use(
  config => {
    const role = getRoleFromPath(window.location.pathname) || localStorage.getItem('userRole')
    const { token } = readAuth(role)
    const fallbackToken = localStorage.getItem('token')
    const authToken = token || fallbackToken
    if (authToken) {
      config.headers.Authorization = `Bearer ${authToken}`
    }
    return config
  },
  error => {
    return Promise.reject(error)
  }
)

export default api
