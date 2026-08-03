import { useState, useEffect } from 'react'
import { billingGateways, billingCheckout } from '../../lib/storage'

// Modal de pago de un plan. El usuario elige la pasarela y en ambos casos se le REDIRIGE al
// checkout alojado de la pasarela (los datos de la tarjeta nunca pasan por nosotros):
//   Stripe → Checkout Session (USD, recurrente automático).
//   Wompi  → Payment Link (COP): tarjeta con 3D Secure, PSE, Nequi, Bancolombia… El plan se
//            activa cuando Wompi confirma el pago por webhook.

const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }
const modal = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: 22, width: 'min(440px, 96vw)', maxHeight: '92vh', overflowY: 'auto' }

const money = (n, cur) => cur === 'USD'
  ? `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} USD`
  : `$${Number(n || 0).toLocaleString('es-CO')} COP`

export default function CheckoutModal({ plan, onClose }) {
  const [gateways, setGateways] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => { billingGateways().then(setGateways).catch(() => setGateways({ availability: {} })) }, [])

  // Ambas pasarelas devuelven una URL de checkout alojado a la que se redirige.
  async function pay(gateway) {
    setBusy(true); setErr('')
    try {
      const r = await billingCheckout({ planId: plan.id, gateway })
      if (r?.url) { window.location.href = r.url; return }
      setErr(`No se pudo iniciar el pago con ${gateway === 'stripe' ? 'Stripe' : 'Wompi'}.`); setBusy(false)
    } catch (e) { setErr(e.message || 'No se pudo iniciar el pago'); setBusy(false) }
  }

  const avail = gateways?.availability || {}
  const anyGateway = avail.stripe || avail.wompi

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={modal}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: 17 }}>Suscribirte — {plan.name}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text2)', margin: '6px 0 12px' }}>
          {plan.contactLimit ? `${plan.contactLimit.toLocaleString('es-CO')} contactos/mes` : 'Contactos ilimitados'} ·
          {' '}<strong>{money(plan.priceCop, 'COP')}</strong> / mes
        </p>

        {!gateways ? <div style={{ color: 'var(--text3)', fontSize: 13 }}>Cargando pasarelas…</div>
          : !anyGateway ? <div style={{ fontSize: 13, color: 'var(--amber,#f59e0b)' }}>Aún no hay pasarelas de pago configuradas. Contacta al equipo de AVI.</div>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 }}>
              {avail.wompi && (
                <button onClick={() => pay('wompi')} disabled={busy} style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text)', cursor: busy ? 'default' : 'pointer', fontSize: 14, fontWeight: 600, textAlign: 'left', opacity: busy ? .6 : 1 }}>
                  🟣 Pagar en COP con Wompi <span style={{ color: 'var(--text3)', fontWeight: 400 }}>· {money(plan.priceCop, 'COP')}/mes</span>
                  <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 400, marginTop: 3 }}>Tarjeta, PSE, Nequi o Bancolombia</div>
                </button>
              )}
              {avail.stripe && (
                <button onClick={() => pay('stripe')} disabled={busy} style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text)', cursor: busy ? 'default' : 'pointer', fontSize: 14, fontWeight: 600, textAlign: 'left', opacity: busy ? .6 : 1 }}>
                  🔵 Pagar en USD con Stripe <span style={{ color: 'var(--text3)', fontWeight: 400 }}>· {money(plan.priceUsd, 'USD')}/mes</span>
                  <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 400, marginTop: 3 }}>Tarjeta internacional · renovación automática</div>
                </button>
              )}
              {busy && <div style={{ fontSize: 12.5, color: 'var(--text2)' }}>⏳ Abriendo la pasarela de pago…</div>}
              <span style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4, lineHeight: 1.5 }}>
                Te llevamos al sitio seguro de la pasarela para completar el pago. Tu plan se activa
                en cuanto la pasarela confirma la transacción.
              </span>
            </div>
          )}

        {err && <div style={{ marginTop: 12, padding: '9px 12px', borderRadius: 9, fontSize: 12.5, fontWeight: 600, background: 'rgba(255,95,95,.12)', color: '#ff5f5f', border: '1px solid rgba(255,95,95,.35)' }}>{err}</div>}
      </div>
    </div>
  )
}
