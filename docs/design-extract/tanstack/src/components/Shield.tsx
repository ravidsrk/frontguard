/**
 * Frontguard shield mark — an amber shield with a centered vertical notch
 * that shows the background through it. `notch` should match the surface
 * color the mark sits on.
 */
export function Shield({
  w = 22,
  h = 26,
  notch = '#0d0c0b',
  line = 1.5,
}: {
  w?: number
  h?: number
  notch?: string
  line?: number
}) {
  const clip = 'polygon(0% 0%, 100% 0%, 100% 62%, 50% 100%, 0% 62%)'
  return (
    <span
      style={{ position: 'relative', width: w, height: h, display: 'inline-block' }}
      aria-hidden="true"
    >
      <span
        style={{ position: 'absolute', inset: 0, background: '#e8862e', clipPath: clip }}
      />
      <span
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: '50%',
          width: line,
          transform: 'translateX(-50%)',
          background: notch,
          clipPath: clip,
        }}
      />
    </span>
  )
}
