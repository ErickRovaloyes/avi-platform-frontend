import { useState, useEffect, useCallback } from 'react'
import { useAccount } from '../../context/AccountContext'
import {
  googleStatus, googleAuthUrl, googleDisconnect, googlePickerConfig,
  listGoogleSheets, addGoogleSheet, removeGoogleSheet,
} from '../../lib/storage'

// Carga (una vez) el script de Google API + el módulo Picker.
let _pickerLoading = null
function loadPicker() {
  if (window.google?.picker) return Promise.resolve()
  if (_pickerLoading) return _pickerLoading
  _pickerLoading = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://apis.google.com/js/api.js'
    s.onload = () => window.gapi.load('picker', { callback: resolve, onerror: () => reject(new Error('No se pudo cargar el Google Picker')) })
    s.onerror = () => reject(new Error('No se pudo cargar la API de Google'))
    document.body.appendChild(s)
  })
  return _pickerLoading
}

export default function GoogleSheetsPanel() {
  const { account } = useAccount()
  const accId = account?.id
  const [status, setStatus] = useState({ loading: true, connected: false, configured: true, email: '' })
  const [sheets, setSheets] = useState([])
  const [picking, setPicking] = useState(false)
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
      const before = (status.connections || []).length
      const { url } = await googleAuthUrl(accId)
      window.open(url, 'google_oauth', 'width=520,height=640')
      // Polling corto hasta que aparezca la cuenta NUEVA (aumenta el conteo).
      let n = 0
      const iv = setInterval(async () => {
        n++; const st = await googleStatus(accId).catch(() => null)
        if ((st?.connections?.length || 0) > before || n > 60) { clearInterval(iv); reload() }
      }, 2000)
    } catch (e) { setMsg(e?.message || 'No se pudo iniciar la conexión con Google') }
  }
  async function disconnect(connectionId, email) {
    if (!confirm(`¿Desconectar la cuenta de Google${email ? ` "${email}"` : ''}?`)) return
    await googleDisconnect(accId, connectionId); reload()
  }
  // Abre el Google Picker (solo hojas de cálculo). Al elegir una, Google concede
  // acceso drive.file a ESE archivo y la vinculamos.
  async function pickSheet() {
    if (picking) return
    setMsg(''); setPicking(true)
    try {
      const cfg = await googlePickerConfig(accId)   // { apiKey, appId, oauthToken }
      await loadPicker()
      const gp = window.google.picker
      const view = new gp.DocsView(gp.ViewId.SPREADSHEETS).setMode(gp.DocsViewMode.LIST).setSelectFolderEnabled(false)
      const picker = new gp.PickerBuilder()
        .setDeveloperKey(cfg.apiKey)
        .setAppId(cfg.appId)
        .setOAuthToken(cfg.oauthToken)
        .addView(view)
        .setTitle('Elige una hoja de cálculo')
        .setCallback(async (data) => {
          if (data.action === gp.Action.PICKED) {
            const doc = data.docs?.[0]
            if (!doc) return
            try {
              const r = await addGoogleSheet(accId, { name: doc.name, spreadsheetId: doc.id, url: doc.url })
              if (r.warning) setMsg('⚠ ' + r.warning)
              setSheets(await listGoogleSheets(accId))
            } catch (e) { setMsg(e?.message || 'No se pudo vincular la hoja') }
          }
          if (data.action === gp.Action.PICKED || data.action === gp.Action.CANCEL) setPicking(false)
        })
        .build()
      picker.setVisible(true)
    } catch (e) { setMsg(e?.message || 'No se pudo abrir el selector de Google'); setPicking(false) }
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
        {(status.connections || []).length > 0 ? (
          <div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>
              Cuentas de Google conectadas — cada calendario puede usar una distinta (elígela en su pestaña Integraciones).
            </div>
            {(status.connections || []).map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 10px', background: 'var(--bg3)', border: '1px solid var(--border2)', borderRadius: 8, marginBottom: 6 }}>
                <div style={{ fontSize: 13, color: 'var(--text)' }}>✅ <strong>{c.email || '(sin email)'}</strong></div>
                <button style={{ ...btn, background: 'transparent', color: 'var(--text2)', border: '1px solid var(--border2)', padding: '5px 10px' }} onClick={() => disconnect(c.id, c.email)}>Desconectar</button>
              </div>
            ))}
            <button style={{ ...btn, background: '#fff', color: '#3c4043', border: '1px solid #dadce0', marginTop: 4 }} onClick={connect} disabled={!status.configured}>
              <span style={{ marginRight: 6 }}>🔵</span> Conectar otra cuenta de Google
            </button>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 10 }}>
              Inicia sesión con tu(s) cuenta(s) de Google. Puedes conectar varias: cada calendario podrá sincronizar con una cuenta distinta, y las hojas de cálculo usarán la primera.
            </div>
            <button style={{ ...btn, background: '#fff', color: '#3c4043', border: '1px solid #dadce0' }} onClick={connect} disabled={!status.configured}>
              <span style={{ marginRight: 6 }}>🔵</span> Iniciar sesión con Google
            </button>
          </div>
        )}
      </div>

      {/* Seleccionar hojas con el Google Picker (scope drive.file) */}
      {status.connected && (
        <div style={card}>
          <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Vincular una hoja</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10 }}>
            Elige la hoja de cálculo de <strong>{status.email || 'tu cuenta de Google'}</strong> con el selector de Google.
            La app solo tendrá acceso a las hojas que selecciones aquí.
          </div>
          <button style={{ ...btn, background: 'var(--accent)', color: '#fff', alignSelf: 'flex-start' }} onClick={pickSheet} disabled={picking}>
            {picking ? 'Abriendo…' : '📄 Seleccionar hoja de Google Sheets'}
          </button>
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
            💡 En el editor de <strong>Flujos</strong>, usa el nodo <strong>Google Sheets</strong> para leer, agregar, editar o eliminar filas: elige la hoja vinculada del desplegable y el rango (ej. <code>Hoja1!A1:Z100</code>).
          </div>
        </div>
      )}
    </div>
  )
}
