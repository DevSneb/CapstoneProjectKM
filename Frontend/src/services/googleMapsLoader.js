let loaderPromise = null

/**
 * Load the Google Maps JavaScript API once.
 * @param {string[]} [libraries] e.g. ['places']
 * @returns {Promise<typeof google.maps>}
 */
export default function loadGoogleMaps(libraries = []) {
  if (typeof window !== 'undefined' && window.google && window.google.maps) {
    return Promise.resolve(window.google.maps)
  }
  if (loaderPromise) return loaderPromise

  const apiKey = process.env.VUE_APP_GOOGLE_MAPS_API_KEY
  if (!apiKey) {
    return Promise.reject(new Error('VUE_APP_GOOGLE_MAPS_API_KEY is not set. Add it in Frontend/.env.local and Frontend/.env.production, then rebuild.'))
  }

  loaderPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-kadiwa-google-maps]')
    if (existing) {
      existing.addEventListener('load', () => {
        if (window.google?.maps) resolve(window.google.maps)
        else reject(new Error('Google Maps failed to load'))
      })
      existing.addEventListener('error', () => reject(new Error('Google Maps script error')))
      return
    }

    const callbackName = `__kadiwaGoogleMapsInit_${Date.now()}`
    window[callbackName] = () => {
      try {
        delete window[callbackName]
      } catch (_) { /* ignore */ }
      if (window.google?.maps) resolve(window.google.maps)
      else reject(new Error('Google Maps failed to load'))
    }

    const libs = libraries.length ? `&libraries=${encodeURIComponent(libraries.join(','))}` : ''
    const script = document.createElement('script')
    script.dataset.kadiwaGoogleMaps = '1'
    script.async = true
    script.defer = true
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}${libs}&callback=${callbackName}`
    script.onerror = () => {
      loaderPromise = null
      reject(new Error('Google Maps script error'))
    }
    document.head.appendChild(script)
  })

  return loaderPromise
}
