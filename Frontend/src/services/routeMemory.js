const KEYS = {
  admin: 'nav:last:admin',
  store_owner: 'nav:last:store_owner',
  customer: 'nav:last:customer',
  pos_user: 'nav:last:pos_user'
}

const PREFIX = {
  admin: '/admin/dashboard',
  store_owner: '/store-owner/dashboard',
  customer: '/customer/dashboard',
  pos_user: '/pos/dashboard'
}

const CUSTOMER_PANEL_TO_PATH = {
  products: '/customer/dashboard/products',
  cart: '/customer/dashboard/cart',
  purchaseHistory: '/customer/dashboard/orders',
  settings: '/customer/dashboard/profile',
  addressBook: '/customer/dashboard/addresses',
  storesMap: '/customer/dashboard/map',
  howToUse: '/customer/dashboard/how-to-use'
}

const CUSTOMER_PATH_TO_PANEL = Object.fromEntries(
  Object.entries(CUSTOMER_PANEL_TO_PATH).map(([panel, path]) => [path, panel])
)

function storageGet(key) {
  try {
    return localStorage.getItem(key) || sessionStorage.getItem(key) || ''
  } catch (_) {
    return ''
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, value)
    sessionStorage.setItem(key, value)
  } catch (_) { /* ignore */ }
}

function rememberPath(role, fullPath) {
  const key = KEYS[role]
  const prefix = PREFIX[role]
  if (!key || !prefix || !fullPath) return
  if (!fullPath.startsWith(prefix)) return
  // Don't remember bare parent only when a deeper path is preferred later via redirect helpers
  storageSet(key, fullPath)
}

function recallPath(role, fallback) {
  const key = KEYS[role]
  const prefix = PREFIX[role]
  const saved = storageGet(key)
  if (saved && saved.startsWith(prefix) && saved !== prefix && saved !== `${prefix}/`) {
    return saved
  }
  return fallback
}

function customerPanelFromPath(path) {
  if (CUSTOMER_PATH_TO_PANEL[path]) return CUSTOMER_PATH_TO_PANEL[path]
  // Support legacy ?panel=
  try {
    const panel = new URLSearchParams(window.location.search).get('panel')
    if (panel && CUSTOMER_PANEL_TO_PATH[panel]) return panel
  } catch (_) { /* ignore */ }
  const remembered = recallPath('customer', '')
  if (remembered && CUSTOMER_PATH_TO_PANEL[remembered.split('?')[0]]) {
    return CUSTOMER_PATH_TO_PANEL[remembered.split('?')[0]]
  }
  return 'products'
}

function customerPathFromPanel(panel) {
  return CUSTOMER_PANEL_TO_PATH[panel] || CUSTOMER_PANEL_TO_PATH.products
}

export {
  rememberPath,
  recallPath,
  customerPanelFromPath,
  customerPathFromPanel,
  CUSTOMER_PANEL_TO_PATH
}
