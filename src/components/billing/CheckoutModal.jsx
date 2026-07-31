import { useState, useEffect } from 'react'
import { billingGateways, billingCheckout } from '../../lib/storage'

// Modal de pago de un plan. El usuario elige la pasarela:
//   Stripe → redirección a Checkout (USD, recurrente automático).
//   Wompi  → tokeniza la tarjeta en el navegador (los datos NO pasan por nuestro server)
//            y cobra en COP; el backend crea la payment source y activa la suscripción.

const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: 16 }
const modal = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: 22, width: 'min(440px, 96vw)', maxHeight: '92vh', overflowY: 'auto' }
const inp = { width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border2)', background: 'var(--bg1)', color: 'var(--text)', fontSize: 14, boxSizing: 'border-box' }
const lbl = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text2)', margin: '10px 0 5px' }

const money = (n, cur) => cur === 'USD'
  ? `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })} USD`
  : `$${Number(n || 0).toLocaleString('es-CO')} COP`

export default function CheckoutModal({ plan, onClose, onDone }) {
  const [gateways, setGateways] = useState(null)
  const [step, setStep] = useState('choose')   // choose | wompi-card
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [card, setCard] = useState({ number: '', holder: '', exp: '', cvc: '' })

  useEffect(() => { billingGateways().then(setGateways).catch(() => setGateways({ availability: {} })) }, [])

  async function payStripe() {
    setBusy(true); setErr('')
    try {
      const r = await billingCheckout({ planId: plan.id, gateway: 'stripe' })
      if (r?.url) { window.location.href = r.url; return }
      setErr('No se pudo iniciar el pago con Stripe.'); setBusy(false)
    } catch (e) { setErr(e.message || 'Error con Stripe'); setBusy(false) }
  }

  async function payWompi(e) {
    e?.preventDefault?.()
    setBusy(true); setErr('')
    try {
      const w = gateways?.wompi
      if (!w?.publicKey || !w?.apiBase) throw new Error('Wompi no está disponible')
      const [mm, yy] = String(card.exp).split('/').map(s => s.trim())
      // Tokeniza la tarjeta directamente contra Wompi (los datos no tocan nuestro servidor).
      const tokRes = await fetch(`${w.apiBase}/tokens/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${w.publicKey}` },
        body: JSON.stringify({ number: card.number.replace(/\s+/g, ''), cvc: card.cvc, exp_month: mm, exp_year: yy, card_holder: card.holder }),
      })
      const tokJson = await tokRes.json().catch(() => ({}))
      const cardToken = tokJson?.data?.id
      if (!cardToken) throw new Error(tokJson?.error?.messages ? JSON.stringify(tokJson.error.messages) : 'Tarjeta inválida')
      const r = await billingCheckout({ planId: plan.id, gateway: 'wompi', cardToken, acceptanceToken: w.acceptanceToken })
      if (r?.ok) { onDone?.(); return }
      throw new Error(r?.status === 'declined' ? 'El pago fue rechazado por el banco.' : 'El pago quedó pendiente. Intenta de nuevo.')
    } catch (e2) { setErr(e2.message || 'Error con Wompi'); setBusy(false) }
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
          : step === 'choose' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 }}>
              {avail.stripe && (
                <button onClick={payStripe} disabled={busy} style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text)', cursor: 'pointer', fontSize: 14, fontWeight: 600, textAlign: 'left' }}>
                  🔵 Pagar con tarjeta en USD (Stripe) <span style={{ color: 'var(--text3)', fontWeight: 400 }}>· {money(plan.priceUsd, 'USD')}/mes</span>
                </button>
              )}
              {avail.wompi && (
                <button onClick={() => setStep('wompi-card')} disabled={busy} style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border2)', background: 'var(--bg3)', color: 'var(--text)', cursor: 'pointer', fontSize: 14, fontWeight: 600, textAlign: 'left' }}>
                  🟣 Pagar con tarjeta en COP (Wompi) <span style={{ color: 'var(--text3)', fontWeight: 400 }}>· {money(plan.priceCop, 'COP')}/mes</span>
                </button>
              )}
              <span style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>El cobro es mensual y automático. Puedes cambiar o cancelar tu plan cuando quieras.</span>
            </div>
          ) : (
            <form onSubmit={payWompi}>
              <label style={lbl}>Número de tarjeta</label>
              <input style={inp} inputMode="numeric" autoComplete="cc-number" placeholder="4242 4242 4242 4242" value={card.number} onChange={e => setCard(c => ({ ...c, number: e.target.value }))} />
              <label style={lbl}>Titular</label>
              <input style={inp} autoComplete="cc-name" placeholder="Como aparece en la tarjeta" value={card.holder} onChange={e => setCard(c => ({ ...c, holder: e.target.value }))} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={lbl}>Vence (MM/AA)</label><input style={inp} placeholder="08/28" value={card.exp} onChange={e => setCard(c => ({ ...c, exp: e.target.value }))} /></div>
                <div><label style={lbl}>CVC</label><input style={inp} inputMode="numeric" autoComplete="cc-csc" placeholder="123" value={card.cvc} onChange={e => setCard(c => ({ ...c, cvc: e.target.value }))} /></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 16 }}>
                <button type="button" onClick={() => setStep('choose')} style={{ padding: '9px 14px', borderRadius: 9, border: '1px solid var(--border2)', background: 'transparent', color: 'var(--text2)', cursor: 'pointer', fontSize: 13 }}>← Volver</button>
                <button type="submit" disabled={busy} style={{ padding: '10px 18px', borderRadius: 9, border: 'none', background: '#7c6fff', color: '#fff', fontWeight: 700, fontSize: 14, cursor: busy ? 'default' : 'pointer', opacity: busy ? .6 : 1 }}>
                  {busy ? '⏳ Procesando…' : `Pagar ${money(plan.priceCop, 'COP')}`}
                </button>
              </div>
            </form>
          )}

        {err && <div style={{ marginTop: 12, padding: '9px 12px', borderRadius: 9, fontSize: 12.5, fontWeight: 600, background: 'rgba(255,95,95,.12)', color: '#ff5f5f', border: '1px solid rgba(255,95,95,.35)' }}>{err}</div>}
      </div>
    </div>
  )
}
