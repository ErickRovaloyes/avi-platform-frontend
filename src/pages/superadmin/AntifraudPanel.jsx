import { useState, useEffect, useCallback } from 'react'
import { listDemoRegistrations, getDemoOverrides, allowDemo, removeDemoOverride, setDemoIpRestriction } from '../../lib/storage'

const RESULT_META = {
  created:           { label: 'Creada',               color: '#22d98a' },
  created_override:  { label: 'Creada (excepción)',   color: '#4fa8ff' },
  blocked_email:     { label: 'Bloqueada · correo',   color: '#ff5f5f' },
  blocked_ip:        { label: 'Bloqueada · IP',       color: '#ff5f5f' },
  blocked_fingerprint:{ label: 'Bloqueada · dispositivo', color: '#ff5f5f' },
  blocked_phone:     { label: 'Bloqueada · teléfono', color: '#ff5f5f' },
}
const KIND_LABEL = { email: 'Correo', ip: 'IP', fingerprint: 'Dispositivo', phone: 'Teléfono', global_ip_off: 'Regla IP desactivada' }
const fmt = ts => ts ? new Date(Number(ts)).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

const card = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 14 }
const inp = { padding: '8px 10px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 7, color: 'var(--text)', fontSize: 13 }
const btn = (bg, c = '#fff') => ({ padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', background: bg, color: c, fontSize: 13, fontWeight: 600 })

export default function AntifraudPanel() {
  const [regs, setRegs] = useState([])
  const [overrides, setOverrides] = useState([])
  const [ipEnabled, setIpEnabled] = useState(true)
  const [q, setQ] = useState('')
  const [fResult, setFResult] = useState('')
  const [allow, setAllow] = useState({ email: '', ip: '', fingerprint: '', phone: '', note: '' })
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    try {
      const [r, o] = await Promise.all([listDemoRegistrations({ q, result: fResult, limit: 300 }), getDemoOverrides()])
      setRegs(r || [])
      setOverrides(o?.overrides || [])
      setIpEnabled(o?.ipRestrictionEnabled !== false)
    } catch { /* */ }
  }, [q, fResult])
  useEffect(() => { reload() }, [reload])

  async function toggleIp() {
    setBusy(true)
    try { await setDemoIpRestriction(!ipEnabled); await reload() } catch (e) { alert(e.message) }
    setBusy(false)
  }
  async function submitAllow(e) {
    e.preventDefault()
    if (!allow.email && !allow.ip && !allow.fingerprint && !allow.phone) { alert('Indica al menos un identificador.'); return }
    setBusy(true)
    try { await allowDemo(allow); setAllow({ email: '', ip: '', fingerprint: '', phone: '', note: '' }); await reload() } catch (e) { alert(e.message) }
    setBusy(false)
  }
  async function delOverride(id) { try { await removeDemoOverride(id); reload() } catch (e) { alert(e.message) } }

  const created = regs.filter(r => r.result?.startsWith('created')).length
  const blocked = regs.filter(r => r.result?.startsWith('blocked')).length

  return (
    <div style={{ padding: 28, maxWidth: 1040, overflowY: 'auto' }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 20 }}>🛡 Antifraude Demo</h1>
      <p style={{ fontSize: 13, color: 'var(--text2)', margin: '0 0 16px' }}>Evita Demos duplicadas validando correo, IP (12 meses), huella de dispositivo y teléfono. Aquí ves el historial y gestionas excepciones.</p>

      {/* Resumen + regla IP */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ ...card, marginBottom: 0, flex: 1, minWidth: 130 }}><div style={{ fontSize: 24, fontWeight: 800, color: '#22d98a' }}>{created}</div><div style={{ fontSize: 12, color: 'var(--text2)' }}>Demos creadas</div></div>
        <div style={{ ...card, marginBottom: 0, flex: 1, minWidth: 130 }}><div style={{ fontSize: 24, fontWeight: 800, color: '#ff5f5f' }}>{blocked}</div><div style={{ fontSize: 12, color: 'var(--text2)' }}>Intentos bloqueados</div></div>
        <div style={{ ...card, marginBottom: 0, flex: 2, minWidth: 220, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div><div style={{ fontWeight: 700, fontSize: 13 }}>Restricción por IP</div><div style={{ fontSize: 12, color: 'var(--text2)' }}>{ipEnabled ? 'Activa (1 Demo por IP / 12 meses)' : 'Desactivada'}</div></div>
          <button style={{ ...btn(ipEnabled ? 'transparent' : 'var(--green)', ipEnabled ? 'var(--text2)' : '#fff'), border: '1px solid var(--border2)' }} onClick={toggleIp} disabled={busy}>{ipEnabled ? 'Desactivar' : 'Activar'}</button>
        </div>
      </div>

      {/* Permitir nueva Demo / reiniciar restricciones */}
      <div style={card}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>✅ Permitir nueva Demo / reiniciar restricciones</div>
        <form onSubmit={submitAllow} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10, alignItems: 'end' }}>
          <input style={inp} placeholder="Correo" value={allow.email} onChange={e => setAllow(a => ({ ...a, email: e.target.value }))} />
          <input style={inp} placeholder="IP" value={allow.ip} onChange={e => setAllow(a => ({ ...a, ip: e.target.value }))} />
          <input style={inp} placeholder="Fingerprint" value={allow.fingerprint} onChange={e => setAllow(a => ({ ...a, fingerprint: e.target.value }))} />
          <input style={inp} placeholder="Teléfono" value={allow.phone} onChange={e => setAllow(a => ({ ...a, phone: e.target.value }))} />
          <input style={inp} placeholder="Nota (opcional)" value={allow.note} onChange={e => setAllow(a => ({ ...a, note: e.target.value }))} />
          <button type="submit" style={btn('var(--accent)')} disabled={busy}>Autorizar</button>
        </form>
        <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 8 }}>Crea una excepción para los identificadores indicados; el próximo registro Demo con esos datos pasará la validación (la excepción se consume al usarse).</div>
        {overrides.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
            {overrides.map(o => (
              <span key={o.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 20, padding: '3px 10px', opacity: o.used ? .5 : 1 }}>
                <strong>{KIND_LABEL[o.kind] || o.kind}</strong>{o.value && o.kind !== 'global_ip_off' ? `: ${o.value}` : ''}{o.used ? ' (usada)' : ''}
                <button onClick={() => delOverride(o.id)} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer' }}>✕</button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Historial */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 700, fontSize: 13, flex: 1 }}>📜 Historial de intentos ({regs.length})</div>
          <input style={inp} placeholder="Buscar correo/IP/teléfono…" value={q} onChange={e => setQ(e.target.value)} />
          <select style={inp} value={fResult} onChange={e => setFResult(e.target.value)}>
            <option value="">Todos</option>
            <option value="created">Creadas</option>
            <option value="created_override">Creadas (excepción)</option>
            <option value="blocked_email">Bloq · correo</option>
            <option value="blocked_ip">Bloq · IP</option>
            <option value="blocked_fingerprint">Bloq · dispositivo</option>
            <option value="blocked_phone">Bloq · teléfono</option>
          </select>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ color: 'var(--text3)', textAlign: 'left' }}>
                <th style={{ padding: '6px 8px', fontWeight: 700 }}>Fecha</th>
                <th style={{ padding: '6px 8px', fontWeight: 700 }}>Correo</th>
                <th style={{ padding: '6px 8px', fontWeight: 700 }}>IP</th>
                <th style={{ padding: '6px 8px', fontWeight: 700 }}>Dispositivo</th>
                <th style={{ padding: '6px 8px', fontWeight: 700 }}>Teléfono</th>
                <th style={{ padding: '6px 8px', fontWeight: 700 }}>Resultado</th>
                <th style={{ padding: '6px 8px', fontWeight: 700 }}>Expira</th>
              </tr>
            </thead>
            <tbody>
              {regs.map(r => {
                const m = RESULT_META[r.result] || { label: r.result, color: 'var(--text2)' }
                return (
                  <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{fmt(r.created_at)}</td>
                    <td style={{ padding: '6px 8px' }}>{r.email || '—'}</td>
                    <td style={{ padding: '6px 8px', color: 'var(--text2)' }}>{r.ip || '—'}</td>
                    <td style={{ padding: '6px 8px', color: 'var(--text3)', fontFamily: 'var(--mono)', fontSize: 11 }}>{r.fingerprint || '—'}</td>
                    <td style={{ padding: '6px 8px', color: 'var(--text2)' }}>{r.phone || '—'}</td>
                    <td style={{ padding: '6px 8px' }}><span style={{ fontSize: 11, fontWeight: 700, color: m.color, background: m.color + '22', borderRadius: 20, padding: '2px 8px', whiteSpace: 'nowrap' }}>{m.label}</span></td>
                    <td style={{ padding: '6px 8px', color: 'var(--text3)' }}>{r.expires_at ? new Date(Number(r.expires_at)).toLocaleDateString('es') : '—'}</td>
                  </tr>
                )
              })}
              {regs.length === 0 && <tr><td colSpan={7} style={{ padding: 18, textAlign: 'center', color: 'var(--text3)' }}>Sin registros.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
