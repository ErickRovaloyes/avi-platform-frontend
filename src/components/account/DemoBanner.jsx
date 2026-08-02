import { useState, useEffect, useCallback } from 'react'
import { useAccount } from '../../context/AccountContext'
import { getAccountSubscription } from '../../lib/storage'
import { getSocket } from '../../lib/api'

const DAY = 86400000
const PHASE_INDEX = { agente_starter: 0, crm_starter: 1, month2: -1 }

// Franja superior para cuentas del PLAN GRATUITO (demos nuevas y cuentas que bajaron a Gratuito):
// muestra la etapa actual de las 3, cuánto falta para la siguiente y el consumo de contactos.
// Para cuentas Demo ANTIGUAS (tipo Demo con vigencia a 7 días) conserva el contador legacy.
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

  // ── Plan Gratuito (3 etapas) ──
  if (sub?.planFamily === 'free') {
    const now = Date.now()
    const stages = (Array.isArray(sub.type?.freeStages) && sub.type.freeStages.length)
      ? sub.type.freeStages : (Array.isArray(data.planState?.stages) ? data.planState.stages : [])
    if (!stages.length) return null
    const n = stages.length, lastIdx = n - 1
    const phase = data.planState?.phase
    let cur = (phase && phase in PHASE_INDEX) ? (PHASE_INDEX[phase] === -1 ? lastIdx : PHASE_INDEX[phase]) : 0
    const started = Number(sub.freeStartedAt) || now
    const ageDays = (now - started) / DAY
    const cumDays = i => stages.slice(0, i + 1).reduce((a, s) => a + (Number(s.days) || 0), 0)
    if (!(phase in PHASE_INDEX)) { cur = lastIdx; for (let i = 0; i < lastIdx; i++) { if (ageDays < cumDays(i)) { cur = i; break } } }
    const stage = stages[cur] || stages[lastIdx]
    const isLast = cur === lastIdx
    const contactCount = data.contactCount ?? 0
    const contactLimit = data.contactLimit || Number(stage.contactLimit) || 0
    const daysLeft = Math.max(0, Math.ceil(cumDays(cur) - ageDays))
    const maxed = contactLimit > 0 && contactCount >= contactLimit

    // Estado de gracia por tope de contactos (última etapa con bloqueo).
    if (sub.status === 'grace' && sub.graceUntil) {
      const gLeft = Math.max(0, Math.ceil((sub.graceUntil - now) / DAY))
      return strip('#e67e22', `⚠️ Plan Gratuito · Alcanzaste el límite de ${contactLimit} contactos · te quedan ${gLeft} día(s) de gracia. Adquiere un plan para no perder el servicio.`)
    }

    const head = `🎁 Plan Gratuito · Etapa ${cur + 1}/${n} — ${stage.label || `Etapa ${cur + 1}`}`
    let bg, text
    if (isLast) {
      bg = maxed ? '#b3261e' : '#e67e22'
      const contactsTxt = contactLimit ? `${contactCount}/${contactLimit} contactos` : `${contactCount} contactos`
      text = maxed && stage.hardBlock
        ? `🔒 Plan Gratuito · Límite de ${contactLimit} contactos alcanzado. Adquiere un plan para reactivar el servicio.`
        : `${head} · ${contactsTxt}${stage.hardBlock ? ' (al llegar al tope se bloquea)' : ''}`
    } else {
      bg = cur === 0 ? 'hsl(150,60%,38%)' : 'hsl(210,70%,42%)'
      const next = stages[cur + 1]
      const contactsTxt = contactLimit ? ` · ${contactCount}/${contactLimit} contactos` : ''
      text = `${head} · ${stage.aiEnabled ? '🤖 IA activa' : 'sin IA'} · faltan ${daysLeft} día(s) para «${next?.label || 'la siguiente etapa'}»${contactsTxt}`
    }
    return strip(bg, text)
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
  const contactsMaxed = used >= maxConv

  if (suspended) {
    return strip('#b3261e', '⛔ Tu prueba Demo terminó y la cuenta está suspendida. Adquiere un plan para reactivar el servicio.')
  }
  const ratio = totalDays ? Math.max(0, Math.min(1, (daysLeft ?? 0) / totalDays)) : 0
  const hue = Math.round(ratio * 120) // 120 = verde · 0 = rojo
  const bg = contactsMaxed ? '#e67e22' : `hsl(${hue}, 64%, 40%)`
  const dleft = daysLeft == null ? '—' : daysLeft
  const dword = daysLeft === 1 ? 'día restante' : 'días restantes'
  const head = `🎁 Cuenta Demo activa · ${dleft} ${dword}`
  const text = contactsMaxed
    ? `${head} · Alcanzaste el límite de ${maxConv} contactos de la Demo`
    : `${head} · ${used}/${maxConv} contactos`
  return strip(bg, text)
}
