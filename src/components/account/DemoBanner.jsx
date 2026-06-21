import { useState, useEffect, useCallback } from 'react'
import { useAccount } from '../../context/AccountContext'
import { getAccountSubscription } from '../../lib/storage'
import { getSocket } from '../../lib/api'

// Franja superior para cuentas DEMO: indica que la Demo está activa y cuánto le
// queda. El color va de verde (recién creada) a rojo (a punto de vencer). Si la
// cuenta queda suspendida, avisa que la Demo terminó; si se alcanzó el límite de
// contactos, lo indica. No se muestra en cuentas que no son Demo.
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
  if (!sub || !sub.type?.isDemo) return null

  const now = Date.now()
  const expiresAt = sub.demoExpiresAt
  const totalDays = sub.type.demoDaysDuration || 7
  const daysLeft  = expiresAt ? Math.max(0, Math.ceil((expiresAt - now) / 86400000)) : null
  const maxConv   = sub.type.demoMaxConversations || 100
  const used      = sub.conversationCount ?? 0
  const suspended = sub.status === 'suspended' || sub.status === 'expired' || (expiresAt && now > expiresAt)
  const contactsMaxed = used >= maxConv

  let bg, text
  if (suspended) {
    bg = '#b3261e'
    text = '⛔ Tu prueba Demo terminó y la cuenta está suspendida. Adquiere un plan para reactivar el servicio.'
  } else {
    // Verde (lejos del final) → rojo (cerca del final), interpolando el tono HSL.
    const ratio = totalDays ? Math.max(0, Math.min(1, (daysLeft ?? 0) / totalDays)) : 0
    const hue = Math.round(ratio * 120) // 120 = verde · 0 = rojo
    bg = contactsMaxed ? '#e67e22' : `hsl(${hue}, 64%, 40%)`
    const dleft = daysLeft == null ? '—' : daysLeft
    const dword = daysLeft === 1 ? 'día restante' : 'días restantes'
    const head = `🎁 Cuenta Demo activa · ${dleft} ${dword}`
    text = contactsMaxed
      ? `${head} · Alcanzaste el límite de ${maxConv} contactos de la Demo`
      : `${head} · ${used}/${maxConv} contactos`
  }

  return (
    <div style={{
      background: bg, color: '#fff', padding: '7px 16px', fontSize: 13, fontWeight: 600,
      textAlign: 'center', letterSpacing: '.2px', lineHeight: 1.35,
    }}>
      {text}
    </div>
  )
}
