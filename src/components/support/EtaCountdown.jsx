import { useState, useEffect } from 'react'

// Muestra la fecha aproximada de entrega con un contador en reversa que se actualiza en vivo.
// Cuando la fecha se pasa, marca el ticket como vencido. Se usa en el cliente y en el super panel.
function parts(ms) {
  const s = Math.floor(Math.abs(ms) / 1000)
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m ${sec}s`
  return `${m}m ${sec}s`
}
const fmtDate = ms => new Date(ms).toLocaleString('es', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function EtaCountdown({ eta, closed, compact }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!eta || closed) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [eta, closed])
  if (!eta) return null

  const remaining = eta - now
  const overdue = remaining <= 0
  const color = closed ? 'var(--text3)' : overdue ? '#ff5f5f' : remaining < 3600000 ? '#f5a623' : '#22d98a'
  const bg = color + '18'

  const wrap = {
    display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
    padding: compact ? '6px 10px' : '9px 12px', borderRadius: 10,
    background: bg, border: `1px solid ${color}55`,
  }
  return (
    <div style={wrap}>
      <span style={{ fontSize: compact ? 16 : 20 }}>{closed ? '📦' : overdue ? '⏰' : '⏳'}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600 }}>Entrega aproximada</div>
        <div style={{ fontSize: compact ? 12.5 : 14, fontWeight: 700, color: 'var(--text)' }}>{fmtDate(eta)}</div>
        {!closed && (
          <div style={{ fontSize: compact ? 12 : 13, fontWeight: 800, color }}>
            {overdue ? `⚠ Tiempo superado hace ${parts(remaining)}` : `Faltan ${parts(remaining)}`}
          </div>
        )}
      </div>
    </div>
  )
}
