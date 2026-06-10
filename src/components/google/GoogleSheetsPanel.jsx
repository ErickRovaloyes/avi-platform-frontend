import { useState, useEffect, useCallback } from 'react'
import { useAccount } from '../../context/AccountContext'
import {
  googleStatus, googleAuthUrl, googleDisconnect,
  listGoogleSheets, addGoogleSheet, removeGoogleSheet,
} from '../../lib/storage'

export default function GoogleSheetsPanel() {
  const { account } = useAccount()
  const accId = account?.id
  const [status, setStatus] = useState({ loading: true, connected: false, configured: true, email: '' })
  const [sheets, setSheets] = useState([])
  const [draft, setDraft] = useState({ name: '', url: '' })
  const [msg, setMsg] = useState('')

  const reload = useCallback(async () => {
    if (!accId) return
    try {
      const st = await googleStatus(accId)
      setStatus({ loading: false, ...st })
      if (st.connected) setSheets(await listGoogleSheets(accId).catch(() => []))
    } catch { setStatus(s => ({ ...s, loading: false })) }
  }, [accId])

  useEffect(() => { reload() }, [reload])
  // Al volver el foco a la pestaña (tras el popup de Google), refrescamos.
  useEffect(() => {
    const onFocus = () => reload()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [reload])

  async function connect() {
    try {
      const { url } = await googleAuthUrl(accId)
      window.open(url, 'google_oauth', 'width=520,height=640')
      // Polling corto hasta que conecte
      let n = 0
      const iv = setInterval(async () => {
        n++; const st = await googleStatus(accId).catch(() => null)
        if (st?.connected || n > 60) { clearInterval(iv); reload() }
      }, 2000)
    } catch (e) { setMsg(e?.message || 'No se pudo iniciar la conexión con Google') }
  }
  async function disconnect() {
    if (!confirm('¿Desconectar Google de esta cuenta?')) return
    await googleDisconnect(accId); reload()
  }
  async function add() {
    if (!draft.url.trim()) return
    setMsg('')
    try {
      const r = await addGoogleSheet(accId, { name: draft.name.trim(), url: draft.url.trim() })
      if (r.warning) setMsg('⚠ ' + r.warning)
      setDraft({ name: '', url: '' })
      setSheets(await listGoogleSheets(accId))
    } catch (e) { setMsg(e?.message || 'No se pudo vincular la hoja') }
  }
  async function remove(id) {
    await removeGoogleSheet(accId, id); setSheets(await listGoogleSheets(accId))
  }

  const card = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 16 }
  const inp = { padding: 9, fontSize: 13, background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border2)', borderRadius: 8, width: '100%', boxSizing: 'border-box' }
  const btn = { padding: '9px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13 }

  if (status.loading) return <div style={{ color: 'var(--text2)', padding: 16 }}>Cargando…</div>

  return (
    <div style={{ maxWidth: 640 }}>
      {/* Conexión */}
      <div style={card}>
        <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>📊 Google Sheets</div>
        {!status.configured && (
          <div style={{ color: '#ffb454', fontSize: 13, marginBottom: 8 }}>
            ⚠ El servidor aún no tiene configuradas las credenciales OAuth de Google (GOOGLE_CLIENT_ID/SECRET).
          </div>
        )}
        {status.connected ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ fontSize: 13, color: 'var(--text)' }}>
              ✅ Conectado{status.email ? <> como <strong>{status.email}</strong></> : ''}
            </div>
            <button style={{ ...btn, background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border2)' }} onClick={disconnect}>Desconectar</button>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 10 }}>
              Inicia sesión con tu cuenta de Google para que AVI pueda leer y escribir en tus hojas de cálculo.
            </div>
            <button style={{ ...btn, background: '#fff', color: '#3c4043', border: '1px solid #dadce0' }} onClick={connect} disabled={!status.configured}>
              <span style={{ marginRight: 6 }}>🔵</span> Iniciar sesión con Google
            </button>
          </div>
        )}
      </div>

      {/* Vincular hojas por link */}
      {status.connected && (
        <div style={card}>
          <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Vincular una hoja</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10 }}>
            Pega el link del Google Sheet. Asegúrate de que la hoja esté compartida con <strong>{status.email || 'tu cuenta de Google'}</strong>.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input style={inp} placeholder="Nombre (ej. Clientes)" value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
            <input style={inp} placeholder="https://docs.google.com/spreadsheets/d/…" value={draft.url} onChange={e => setDraft(d => ({ ...d, url: e.target.value }))} />
            <button style={{ ...btn, background: 'var(--accent)', color: '#fff', alignSelf: 'flex-start' }} onClick={add} disabled={!draft.url.trim()}>+ Vincular hoja</button>
          </div>
          {msg && <div style={{ marginTop: 10, fontSize: 12, color: msg.startsWith('⚠') ? '#ffb454' : 'var(--red,#ff5f5f)' }}>{msg}</div>}

          {sheets.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text3)', fontWeight: 700, marginBottom: 6 }}>Hojas vinculadas</div>
              {sheets.map(sh => (
                <div key={sh.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, marginBottom: 6 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>📄 {sh.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sh.spreadsheetId}</div>
                  </div>
                  <button style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 14 }} title="Quitar" onClick={() => remove(sh.id)}>🗑</button>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 14, fontSize: 12, color: 'var(--text2)', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            💡 En el editor de <strong>Flujos</strong>, usa el nodo <strong>Google Sheets</strong> para leer, agregar, editar o eliminar filas. Pega el mismo link (o el ID) y el rango (ej. <code>Hoja1!A1:Z100</code>).
          </div>
        </div>
      )}
    </div>
  )
}
