import { createRouter, createWebHistory } from 'vue-router'
import AdminLogin from '../views/AdminLogin.vue'
import StoreOwnerLogin from '../views/StoreOwnerLogin.vue'
import PosLogin from '../views/PosLogin.vue'
import CustomerLogin from '../views/CustomerLogin.vue'
import CustomerRegister from '../views/CustomerRegister.vue'
import LandingPage from '../views/LandingPage.vue'
import AdminDashboard from '../views/AdminDashboard.vue'
import StoreOwnerDashboard from '../views/StoreOwnerDashboard.vue'
import PosDashboard from '../views/PosDashboard.vue'
import StorePOS from '../views/store/POS.vue'
import { getRoleFromPath, readAuth } from '../services/authStorage'
import { rememberPath, recallPath, customerPathFromPanel } from '../services/routeMemory'
// Store nested views
const StoreHome = () => import('../views/store/Home.vue')
const StoreProducts = () => import('../views/store/Products.vue')
const StoreOrdersAll = () => import('../views/store/OrdersAll.vue')
const StoreOrdersPending = () => import('../views/store/OrdersPending.vue')
const StoreOrdersOnTheWay = () => import('../views/store/OrdersOnTheWay.vue')
const StoreOrdersDelivered = () => import('../views/store/OrdersDelivered.vue')
const StoreOrdersRejected = () => import('../views/store/OrdersRejected.vue')
const StoreInventoryLow = () => import('../views/store/InventoryLow.vue')
const StoreInventoryOut = () => import('../views/store/InventoryOut.vue')
const StoreInventoryAll = () => import('../views/store/InventoryAll.vue')
const StoreNotifications = () => import('../views/store/Notifications.vue')
const StoreLogistics = () => import('../views/store/Logistics.vue')
const StoreCustomers = () => import('../views/store/Customers.vue')
const StoreAccountProfile = () => import('../views/store/AccountProfile.vue')
const StoreAccountSecurity = () => import('../views/store/AccountSecurity.vue')
const StoreAccountLocation = () => import('../views/store/AccountLocation.vue')
const StoreReports = () => import('../views/store/Reports.vue')
const StoreForecasting = () => import('../views/store/Forecasting.vue')
const StoreCashFlow = () => import('../views/store/CashFlow.vue')
const StoreCashFlow2 = () => import('../views/store/CashFlow2.vue')
const StoreFeaturesManagement = () => import('../views/store/FeaturesManagement.vue')
const StoreRewards = () => import('../views/store/Rewards.vue')
import CustomerDashboard from '../views/CustomerDashboard.vue'
const CustomerProducts = () => import('../views/CustomerProducts.vue')
const CustomerCart = () => import('../views/CustomerCart.vue')
const CustomerOrders = () => import('../views/CustomerOrders.vue')
const CustomerSettings = () => import('../views/CustomerSettings.vue')

// Path-only child markers so customer tabs live in the URL without remounting the shell
const PanelStub = { name: 'PanelStub', render: () => null }

function redirectToRemembered(role, fallbackName) {
  return () => {
    const fallbackPath = role === 'admin'
      ? '/admin/dashboard/home'
      : role === 'store_owner'
        ? '/store-owner/dashboard/home'
        : customerPathFromPanel('dashboard')
    const remembered = recallPath(role, fallbackPath)
    if (remembered) return remembered
    return { name: fallbackName }
  }
}

const routes = [
  {
    path: '/',
    name: 'LandingPage',
    component: LandingPage
  },
  {
    path: '/admin/login',
    name: 'AdminLogin',
    component: AdminLogin
  },
  {
    path: '/store-owner/login',
    name: 'StoreOwnerLogin',
    component: StoreOwnerLogin
  },
  {
    path: '/pos/login',
    name: 'PosLogin',
    component: PosLogin
  },
  { path: '/customer/products', name: 'CustomerProducts', component: CustomerProducts, meta: { requiresAuth: true, role: 'customer' } },
  { path: '/customer/cart', name: 'CustomerCart', component: CustomerCart, meta: { requiresAuth: true, role: 'customer' } },
  { path: '/customer/orders', name: 'CustomerOrders', component: CustomerOrders, meta: { requiresAuth: true, role: 'customer' } },
  { path: '/customer/settings', name: 'CustomerSettings', component: CustomerSettings, meta: { requiresAuth: true, role: 'customer' } },
  {
    path: '/customer/login',
    name: 'CustomerLogin',
    component: CustomerLogin
  },
  {
    path: '/customer/register',
    name: 'CustomerRegister',
    component: CustomerRegister
  },
  {
    path: '/admin/dashboard',
    name: 'AdminDashboard',
    component: AdminDashboard,
    meta: { requiresAuth: true, role: 'admin' },
    children: [
      { path: '', redirect: redirectToRemembered('admin', 'AdminHome') },
      { path: 'home', name: 'AdminHome', component: () => import('../views/admin/HomeAnalytics.vue') },
      { path: 'reports/sales', name: 'AdminSalesReports', component: () => import('../views/admin/SalesReports.vue') },
      { path: 'price-monitoring', name: 'AdminPriceMonitoring', component: () => import('../views/admin/PriceMonitoring.vue') },
      { path: 'market-prices', name: 'AdminMarketPrices', component: () => import('../views/admin/MarketPrices.vue') },
      { path: 'integrity', name: 'AdminIntegrityRecords', component: () => import('../views/admin/IntegrityRecords.vue') },
      { path: 'stores', name: 'AdminStores', component: () => import('../views/admin/Stores.vue') },
      { path: 'household', name: 'AdminHousehold', component: () => import('../views/admin/Household.vue') },
      { path: 'account/settings', name: 'AdminAccountSettings', component: () => import('../views/admin/AccountSettings.vue') }
    ]
  },
  {
    path: '/store-owner/dashboard',
    name: 'StoreOwnerDashboard',
    component: StoreOwnerDashboard,
    meta: { requiresAuth: true, role: 'store_owner' },
    children: [
      { path: '', redirect: redirectToRemembered('store_owner', 'StoreHome') },
      { path: 'home', name: 'StoreHome', component: StoreHome },
      { path: 'products', name: 'StoreProducts', component: StoreProducts },
      { path: 'orders/all', name: 'StoreOrdersAll', component: StoreOrdersAll },
      { path: 'orders/pending', name: 'StoreOrdersPending', component: StoreOrdersPending },
      { path: 'orders/on-the-way', name: 'StoreOrdersOnTheWay', component: StoreOrdersOnTheWay },
      { path: 'orders/delivered', name: 'StoreOrdersDelivered', component: StoreOrdersDelivered },
      { path: 'orders/rejected', name: 'StoreOrdersRejected', component: StoreOrdersRejected },
      { path: 'inventory/low', name: 'StoreInventoryLow', component: StoreInventoryLow },
      { path: 'inventory/out', name: 'StoreInventoryOut', component: StoreInventoryOut },
      { path: 'inventory/all', name: 'StoreInventoryAll', component: StoreInventoryAll },
      { path: 'customers', name: 'StoreCustomers', component: StoreCustomers },
      { path: 'notifications', name: 'StoreNotifications', component: StoreNotifications },
      { path: 'logistics', name: 'StoreLogistics', component: StoreLogistics },
      { path: 'pos', name: 'StorePOS', component: StorePOS },
      { path: 'reports', name: 'StoreReports', component: StoreReports },
      { path: 'cash-flow', name: 'StoreCashFlow', component: StoreCashFlow },
      { path: 'cash-flow-2', name: 'StoreCashFlow2', component: StoreCashFlow2 },
      { path: 'forecasting', name: 'StoreForecasting', component: StoreForecasting },
      { path: 'features', name: 'StoreFeaturesManagement', component: StoreFeaturesManagement },
      { path: 'rewards', name: 'StoreRewards', component: StoreRewards },
      { path: 'account/profile', name: 'StoreAccountProfile', component: StoreAccountProfile },
      { path: 'account/security', name: 'StoreAccountSecurity', component: StoreAccountSecurity },
      { path: 'account/location', name: 'StoreAccountLocation', component: StoreAccountLocation }
    ]
  },
  {
    path: '/customer/dashboard',
    component: CustomerDashboard,
    meta: { requiresAuth: true, role: 'customer' },
    children: [
      { path: '', name: 'CustomerDashboard', redirect: redirectToRemembered('customer', 'CustomerDashHome') },
      { path: 'home', name: 'CustomerDashHome', component: PanelStub, meta: { panel: 'dashboard' } },
      { path: 'products', name: 'CustomerDashProducts', component: PanelStub, meta: { panel: 'products' } },
      { path: 'cart', name: 'CustomerDashCart', component: PanelStub, meta: { panel: 'cart' } },
      { path: 'orders', name: 'CustomerDashOrders', component: PanelStub, meta: { panel: 'purchaseHistory' } },
      { path: 'profile', name: 'CustomerDashProfile', component: PanelStub, meta: { panel: 'settings' } },
      { path: 'addresses', name: 'CustomerDashAddresses', component: PanelStub, meta: { panel: 'addressBook' } },
      { path: 'map', name: 'CustomerDashMap', component: PanelStub, meta: { panel: 'storesMap' } },
      { path: 'notifications', name: 'CustomerDashNotifications', component: PanelStub, meta: { panel: 'notifications' } },
      { path: 'how-to-use', name: 'CustomerDashHowToUse', component: PanelStub, meta: { panel: 'howToUse' } }
    ]
  },
  {
    path: '/pos/dashboard',
    name: 'PosDashboard',
    component: PosDashboard,
    meta: { requiresAuth: true, role: 'pos_user' }
  }
]

const router = createRouter({
  history: createWebHistory(process.env.BASE_URL),
  routes
})

const CHUNK_RELOAD_KEY = 'chunk-reload-attempted'

// Recover once from lazy-loaded chunk failures (stale assets, cache, transient fetch failure).
router.onError((error, to) => {
  const message = error?.message || ''
  const isChunkLoadError = /ChunkLoadError|Loading chunk [\w-]+ failed|Failed to fetch dynamically imported module/i.test(message)

  if (!isChunkLoadError) return

  if (!sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
    sessionStorage.setItem(CHUNK_RELOAD_KEY, '1')
    const targetPath = to?.fullPath || window.location.pathname
    window.location.assign(targetPath)
    return
  }

  sessionStorage.removeItem(CHUNK_RELOAD_KEY)
})

router.afterEach((to) => {
  sessionStorage.removeItem(CHUNK_RELOAD_KEY)
  const role = to.meta.role || getRoleFromPath(to.path)
  if (role && to.fullPath) rememberPath(role, to.fullPath)
})

function loginPathForRole(role) {
  if (role === 'admin') return '/admin/login'
  if (role === 'store_owner') return '/store-owner/login'
  if (role === 'pos_user') return '/pos/login'
  return '/customer/login'
}

// Navigation guard
router.beforeEach((to, from, next) => {
  const role = to.meta.role || getRoleFromPath(to.path)
  const auth = readAuth(role)
  const token = auth.token
  // Prefer stored role, then user.role — missing userRole used to wrongly send refresh → landing `/`
  const userRole = auth.userRole || auth.user?.role || null

  if (to.matched.some(record => record.meta.requiresAuth)) {
    if (!token) {
      next(loginPathForRole(role || to.meta.role))
    } else if (to.meta.role && userRole && to.meta.role !== userRole) {
      next('/')
    } else {
      next()
    }
  } else {
    next()
  }
})

export default router
