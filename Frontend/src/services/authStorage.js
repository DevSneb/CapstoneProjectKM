const ROLE_STORAGE_KEYS = {
  admin: 'auth:admin',
  store_owner: 'auth:store_owner',
  pos_user: 'auth:pos_user',
  customer: 'auth:customer'
}

function getRoleFromPath(pathname = window.location.pathname) {
  if (pathname.startsWith('/admin')) return 'admin'
  if (pathname.startsWith('/store-owner')) return 'store_owner'
  if (pathname.startsWith('/pos')) return 'pos_user'
  if (pathname.startsWith('/customer')) return 'customer'
  return null
}

function getAuthBucket(role) {
  return ROLE_STORAGE_KEYS[role] || null
}

function readAuth(role) {
  const bucket = getAuthBucket(role)
  const fallbackToken = localStorage.getItem('token')
  const fallbackUserRole = localStorage.getItem('userRole')

  if (!bucket) {
    let user = null
    try {
      user = JSON.parse(localStorage.getItem('user') || 'null')
    } catch (_) {
      user = null
    }
    return {
      token: fallbackToken,
      user,
      userRole: fallbackUserRole || user?.role || null
    }
  }

  const token = sessionStorage.getItem(`${bucket}:token`) || localStorage.getItem(`${bucket}:token`) || fallbackToken
  const userJson = sessionStorage.getItem(`${bucket}:user`) || localStorage.getItem(`${bucket}:user`) || localStorage.getItem('user') || 'null'
  const userRole = sessionStorage.getItem(`${bucket}:userRole`) || localStorage.getItem(`${bucket}:userRole`) || fallbackUserRole

  let user = null
  try {
    user = JSON.parse(userJson || 'null')
  } catch (_) {
    user = null
  }

  return {
    token,
    user,
    userRole: userRole || user?.role || null
  }
}

function writeAuth(user, token) {
  const role = user?.role || 'customer'
  const bucket = getAuthBucket(role)

  localStorage.setItem('token', token)
  localStorage.setItem('user', JSON.stringify(user))
  localStorage.setItem('userRole', role)

  if (bucket) {
    sessionStorage.setItem(`${bucket}:token`, token)
    sessionStorage.setItem(`${bucket}:user`, JSON.stringify(user))
    sessionStorage.setItem(`${bucket}:userRole`, role)
    localStorage.setItem(`${bucket}:token`, token)
    localStorage.setItem(`${bucket}:user`, JSON.stringify(user))
    localStorage.setItem(`${bucket}:userRole`, role)
  }
}

function clearAuth(role) {
  const roles = role ? [role] : Object.keys(ROLE_STORAGE_KEYS)
  for (const currentRole of roles) {
    const bucket = getAuthBucket(currentRole)
    if (!bucket) continue
    sessionStorage.removeItem(`${bucket}:token`)
    sessionStorage.removeItem(`${bucket}:user`)
    sessionStorage.removeItem(`${bucket}:userRole`)
    localStorage.removeItem(`${bucket}:token`)
    localStorage.removeItem(`${bucket}:user`)
    localStorage.removeItem(`${bucket}:userRole`)
  }
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  localStorage.removeItem('userRole')
}

export { getRoleFromPath, readAuth, writeAuth, clearAuth }