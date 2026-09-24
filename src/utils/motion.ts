// Small script-driven animations. They all do nothing when animations are off.

export function motionEnabled(): boolean {
  return (
    typeof document !== 'undefined' && !document.documentElement.classList.contains('motion-off')
  )
}

/** The visible element marked data-cart-target (the cart panel, or the cart button on small screens). */
function cartTarget(): HTMLElement | null {
  const targets = document.querySelectorAll<HTMLElement>('[data-cart-target]')
  for (const el of targets) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) return el
  }
  return null
}

/**
 * Sends a copy of the product's icon from where it was tapped to the cart, in a short arc,
 * then gives the cart a small bump. Shows staff where the item went.
 */
export function flyToCart(from: Element | null | undefined, emoji: string) {
  if (!from || !motionEnabled()) return
  const target = cartTarget()
  if (!target) return
  const a = from.getBoundingClientRect()
  const b = target.getBoundingClientRect()
  const start = { x: a.left + a.width / 2, y: a.top + a.height / 2 }
  const end = { x: b.left + Math.min(b.width / 2, 48), y: b.top + Math.min(b.height / 2, 28) }
  const dx = end.x - start.x
  const dy = end.y - start.y

  const dot = document.createElement('div')
  dot.textContent = emoji
  dot.setAttribute('aria-hidden', 'true')
  Object.assign(dot.style, {
    position: 'fixed',
    left: `${start.x}px`,
    top: `${start.y}px`,
    zIndex: '70',
    fontSize: '28px',
    lineHeight: '1',
    pointerEvents: 'none',
    translate: '-50% -50%',
  })
  document.body.appendChild(dot)
  const flight = dot.animate(
    [
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      // Rise a little before dropping into the cart, like a toss.
      {
        transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 60}px) scale(0.9)`,
        opacity: 1,
        offset: 0.5,
      },
      { transform: `translate(${dx}px, ${dy}px) scale(0.4)`, opacity: 0.2 },
    ],
    { duration: 460, easing: 'cubic-bezier(0.3, 0.6, 0.4, 1)' },
  )
  const cleanup = () => dot.remove()
  flight.onfinish = () => {
    cleanup()
    target.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.04)' }, { transform: 'scale(1)' }],
      { duration: 220, easing: 'ease-out' },
    )
  }
  flight.oncancel = cleanup
}
