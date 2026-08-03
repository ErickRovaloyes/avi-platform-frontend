import { useState, useEffect, useCallback } from 'react'
import { useAccount } from '../../context/AccountContext'
import { getAccountSubscription } from '../../lib/storage'
import { getSocket } from '../../lib/api'

const DAY = 86400000

// Franja superior para cuentas del PLAN GRATUITO (demos y cuentas que bajaron a gratuito):
// tienen acceso a TODO y su única limitación son las conversaciones del mes, así que solo
// se muestra ese contador. Para cuentas Demo ANTIGUAS (tipo Demo con vigencia a 7 días) se
// conserva el contador legacy.
export default function DemoBanner() {
  const { account } = useAccount()
  const accId = account?.id
  const [data, setData] = useState(null)

  const reload = useCallback(async () => {
    if (!accId) return
    try { setData(await getAccountSubscription(accId)) } catch { /* no romper la UI */ }
  }, [accId])

  useEffect(() => { reload() }, [reload])
  useEffect(() => {
    if (!accId) return
    const sock = getSocket()
    const onUpd = ({ accId: a } = {}) => { if (!a || a === accId) reload() }
    sock.on('account:updated', onUpd)
    sock.on('subscription:alert', onUpd)
    sock.on('convos:updated', onUpd)
    const id = setInterval(reload, 60000)
    return () => {
      sock.off('account:updated', onUpd); sock.off('subscription:alert', onUpd)
      sock.off('convos:updated', onUpd); clearInterval(id)
    }
  }, [accId, reload])

  const sub = data?.subscription
  const strip = (bg, text) => (
    <div style={{ background: bg, color: '#fff', padding: '7px 16px', fontSize: 13, fontWeight: 600, textAlign: 'center', letterSpacing: '.2px', lineHeight: 1.35 }}>{text}</div>
  )

  // ── Plan Gratuito: única limitación = conversaciones del mes ──
  if (sub?.planFamily === 'free') {
    const limit = data.planState?.conversationLimit || 0
    const used = sub.conversationCount ?? 0
    if (!limit) return strip('hsl(150,60%,38%)', '🎁 Plan Gratuito activo · conversaciones ilimitadas')
    const left = Math.max(0, limit - used)
    const pct = Math.min(100, Math.round((used / limit) * 100))
    if (used >= limit) {
      return strip('#b3261e', `🔒 Alcanzaste las ${limit} conversaciones de tu Plan Gratuito. Adquiere un plan para seguir atendiendo con IA.`)
    }
    // Verde → ámbar → rojo según el consumo.
    const bg = pct >= 90 ? '#b3261e' : pct >= 70 ? '#e67e22' : 'hsl(150,60%,38%)'
    return strip(bg, `🎁 Plan Gratuito · ${used}/${limit} conversaciones este mes · te quedan ${left}`)
  }

  // ── Compat: cuentas Demo ANTIGUAS (tipo Demo, vencimiento a 7 días) ──
  if (!sub || !sub.type?.isDemo) return null

  const now = Date.now()
  const expiresAt = sub.demoExpiresAt
  const totalDays = sub.type.demoDaysDuration || 7
  const daysLeft  = expiresAt ? Math.max(0, Math.ceil((expiresAt - now) / DAY)) : null
  const maxConv   = sub.type.demoMaxConversations || 100
  const used      = sub.conversationCount ?? 0
  const suspended = sub.status === 'suspended' || sub.status === 'expired' || (expiresAt && now > expiresAt)
  const convsMaxed = used >= maxConv

  if (suspended) {
    return strip('#b3261e', '⛔ Tu prueba Demo terminó y la cuenta está suspendida. Adquiere un plan para reactivar el servicio.')
  }
  const ratio = totalDays ? Math.max(0, Math.min(1, (daysLeft ?? 0) / totalDays)) : 0
  const hue = Math.round(ratio * 120) // 120 = verde · 0 = rojo
  const bg = convsMaxed ? '#e67e22' : `hsl(${hue}, 64%, 40%)`
  const dleft = daysLeft == null ? '—' : daysLeft
  const dword = daysLeft === 1 ? 'día restante' : 'días restantes'
  const head = `🎁 Cuenta Demo activa · ${dleft} ${dword}`
  const text = convsMaxed
    ? `${head} · Alcanzaste el límite de ${maxConv} conversaciones de la Demo`
    : `${head} · ${used}/${maxConv} conversaciones`
  return strip(bg, text)
}
