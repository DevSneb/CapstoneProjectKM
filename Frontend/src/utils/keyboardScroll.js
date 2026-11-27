/** Keep focused auth inputs visible above the mobile keyboard. */
export function bindKeyboardScroll(rootEl) {
  if (!rootEl || typeof rootEl.addEventListener !== 'function') return () => {}

  const onFocusIn = (event) => {
    const el = event.target
    if (!el || !['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return

    const scroll = () => {
      try {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
      } catch (_) {
        el.scrollIntoView(true)
      }
    }

    // Wait for the soft keyboard / visual viewport to settle
    setTimeout(scroll, 50)
    setTimeout(scroll, 300)
    setTimeout(scroll, 500)
  }

  rootEl.addEventListener('focusin', onFocusIn)
  return () => rootEl.removeEventListener('focusin', onFocusIn)
}
