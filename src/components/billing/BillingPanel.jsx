import { useState, useEffect } from 'react'
import { billingCatalog, billingSubscription } from '../../lib/storage'
import CheckoutModal from './CheckoutModal'

// Panel de Planes y facturación del DUEÑO de la cuenta. Muestra el plan actual con el
// uso de contactos del ciclo y el catálogo (Agente / CRM) con precio en COP (base) y
// USD en vivo. El pago en línea (checkout Stripe/Wompi) se habilita en la Etapa 3.

const FAMILY_META = {
  agente: { label: 'Agente IA', icon: '🧠', accent: '#7c6fff', blurb: 'AVI completo: CRM ilimitado, Agente IA, Zona IA (PMS, Tienda, Restaurante), calendarios, flujos y masivos.' },
  crm:    { label: 'CRM',       icon: '🗂', accent: '#0b8a4f', blurb: 'CRM con IA de gestión, copiloto, calendarios, flujos y masivos. Sin Agente IA ni Zona IA especial.' },
  free:   { label: 'Gratuito',  icon: '🎁', accent: '#f59e0b', blurb: 'Plan de inicio con acceso limitado.' },
}

const money = (n, cur) => cur === 'USD'
  ? `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`
  : `$${Number(n || 0).toLocaleString('es-CO')} COP`

export default function BillingPanel() {
  const [catalog, setCatalog] = useState(null)
  const [sub, setSub] = useState(null)
  const [cur, setCur] = useState('COP')
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [checkoutPlan, setCheckoutPlan] = useState(null)

  async function load() {
    setLoading(true)
    try {
      const [cat, s] = await Promise.all([billingCatalog(), billingSubscription()])
      setCatalog(cat); setSub(s)
    } catch (e) { setMsg('No se pudo cargar el catálogo: ' + (e.message || '')) }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  // Regreso desde el checkout de la pasarela (?billing=success|cancel|wompi): avisa, limpia el
  // parámetro y refresca la suscripción por si el webhook ya activó el plan.
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search)
      const b = p.get('billing')
      if (b === 'success' || b === 'wompi') {
        setMsg('¡Pago recibido! Tu plan se activará en cuanto la pasarela lo confirme (unos segundos).')
        // El webhook puede tardar un momento: se recarga el estado poco después.
        setTimeout(() => { load() }, 6000)
      } else if (b === 'cancel') setMsg('Pago cancelado. Puedes intentarlo cuando quieras.')
      if (b) { p.delete('billing'); const q = p.toString(); window.history.replaceState({}, '', window.location.pathname + (q ? '?' + q : '')) }
    } catch { /* no-op */ }
  }, [])

  function choose(plan) {
    if (plan.isCustomContact) { setMsg('Para el plan a medida, escríbenos a ventas para configurar tu capacidad.'); return }
    setCheckoutPlan(plan)
  }

  const rate = catalog?.fx?.rate
  const family = sub?.planState?.family || sub?.subscription?.planFamily || null
  const contactCount = sub?.contactCount ?? 0
  const contactLimit = sub?.contactLimit ?? 0
  // El Plan Gratuito NO se mide por contactos sino por conversaciones del mes.
  const isFree = family === 'free'
  const convCount = sub?.subscription?.conversationCount ?? 0
  const convLimit = sub?.planState?.conversationLimit ?? 0
  const usedNow  = isFree ? convCount : contactCount
  const limitNow = isFree ? convLimit : contactLimit
  const pct = limitNow > 0 ? Math.min(100, Math.round((usedNow / limitNow) * 100)) : null

  const wrap = { padding: 28, maxWidth: 1080, margin: '0 auto', overflowY: 'auto' }
  const card = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: 18 }

  return (
    <div style={wrap}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>💳 Planes y facturación</h1>
          <p style={{ fontSize: 13, color: 'var(--text2)', margin: '4px 0 0' }}>Elige el plan según tus contactos mensuales. Precio base en pesos; el equivalente en dólares se calcula con la tasa del día.</p>
        </div>
        <div style={{ display: 'flex', gap: 6, background: 'var(--bg3)', borderRadius: 10, padding: 4 }}>
          {['COP', 'USD'].map(c => (
            <button key={c} onClick={() => setCur(c)} style={{
              padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
              background: cur === c ? 'var(--accent)' : 'transparent', color: cur === c ? '#fff' : 'var(--text2)',
            }}>{c}</button>
          ))}
        </div>
      </div>

      {rate && cur === 'USD' && (
        <div style={{ fontSize: 11.5, color: 'var(--text3)', marginBottom: 12 }}>
          1 USD ≈ ${Number(rate).toLocaleString('es-CO')} COP{catalog?.fx?.stale ? ' (aprox.)' : ''} · el cobro se realiza en la moneda que elijas al pagar.
        </div>
      )}

      {msg && <div style={{ ...card, marginBottom: 14, borderColor: 'var(--accent)', fontSize: 13, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <span>{msg}</span><button onClick={() => setMsg('')} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}>✕</button>
      </div>}

      {/* Plan actual */}
      <div style={{ ...card, marginBottom: 18 }}>
        <div style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>Tu plan actual</div>
        {loading ? <div style={{ color: 'var(--text3)', fontSize: 13, marginTop: 8 }}>Cargando…</div> : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginTop: 8 }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>
              {FAMILY_META[family]?.icon || '•'} {sub?.subscription?.plan?.name || FAMILY_META[family]?.label || 'Sin plan asignado'}
            </div>
            {isFree && (
              <span style={{ fontSize: 11, color: 'var(--amber,#f59e0b)', border: '1px solid var(--amber,#f59e0b)', borderRadius: 20, padding: '2px 9px' }}>
                Acceso completo
              </span>
            )}
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4 }}>
                {isFree
                  ? <>Conversaciones este ciclo: <strong>{convCount.toLocaleString('es-CO')}</strong>{convLimit > 0 ? ` / ${convLimit.toLocaleString('es-CO')}` : ' (ilimitadas)'}</>
                  : <>Contactos activos este ciclo: <strong>{contactCount.toLocaleString('es-CO')}</strong>{contactLimit > 0 ? ` / ${contactLimit.toLocaleString('es-CO')}` : ' (ilimitados)'}</>}
              </div>
              {pct != null && (
                <div style={{ height: 8, background: 'var(--bg3)', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: pct >= 90 ? '#ef4444' : pct >= 80 ? '#f59e0b' : 'var(--accent)' }} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Catálogo por familia */}
      {['agente', 'crm'].map(fam => {
        const meta = FAMILY_META[fam]
        const plans = catalog?.[fam] || []
        if (!plans.length) return null
        return (
          <div key={fam} style={{ marginBottom: 22 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
              <h2 style={{ margin: 0, fontSize: 17 }}>{meta.icon} Plan {meta.label}</h2>
              <span style={{ fontSize: 12, color: 'var(--text3)' }}>{meta.blurb}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))', gap: 12 }}>
              {plans.map(p => {
                const isCurrent = sub?.subscription?.subscriptionPlanId === p.id
                return (
                  <div key={p.id} style={{ ...card, borderColor: isCurrent ? meta.accent : 'var(--border)', borderWidth: isCurrent ? 2 : 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: meta.accent }}>{meta.icon} {meta.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 800 }}>
                      {p.isCustomContact ? 'A medida' : `${p.contactLimit ? p.contactLimit.toLocaleString('es-CO') : 'Ilimitados'}`}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: -6 }}>{p.isCustomContact ? 'contactos personalizados' : 'contactos / mes'}</div>
                    <div style={{ fontSize: 17, fontWeight: 700, marginTop: 4 }}>
                      {p.isCustomContact ? '—' : money(cur === 'USD' ? p.priceUsd : p.priceCop, cur)}
                      {!p.isCustomContact && <span style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 500 }}> /mes</span>}
                    </div>
                    <button onClick={() => choose(p)} disabled={isCurrent} style={{
                      marginTop: 6, padding: '9px 12px', borderRadius: 9, border: 'none', cursor: isCurrent ? 'default' : 'pointer',
                      background: isCurrent ? 'var(--bg3)' : meta.accent, color: isCurrent ? 'var(--text3)' : '#fff', fontWeight: 700, fontSize: 13,
                    }}>
                      {isCurrent ? '✓ Plan actual' : p.isCustomContact ? 'Contactar ventas' : 'Elegir plan'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {checkoutPlan && (
        <CheckoutModal
          plan={checkoutPlan}
          onClose={() => setCheckoutPlan(null)}
          onDone={() => { setCheckoutPlan(null); setMsg('¡Pago aprobado! Tu plan se activó. 🎉'); load() }}
        />
      )}
    </div>
  )
}
