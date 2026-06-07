import { useState, useEffect } from 'react'
import { readDB, readConvos } from '../../lib/storage'
import s from './WADebugPanel.module.css'

const SERVER = import.meta.env.VITE_WEBHOOK_SERVER || 'http://localhost:3001'

export default function WADebugPanel({ account, selectedAgent }) {
  const [serverStatus, setServerStatus] = useState(null)
  const [serverDebug, setServerDebug] = useState(null)
  const [testResult, setTestResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [testText, setTestText] = useState('Hola, prueba')

  async function checkServer() {
    try {
      const r = await fetch(`${SERVER}/health`)
      const d = await r.json()
      setServerStatus({ ok: true, ...d })
    } catch (e) {
      setServerStatus({ ok: false, error: e.message })
    }
  }

  async function fetchDebug() {
    try {
      const r = await fetch(`${SERVER}/debug`)
      const d = await r.json()
      setServerDebug(d)
    } catch (e) {
      setServerDebug({ error: e.message })
    }
  }

  async function sendTestMessage() {
    setLoading(true)
    setTestResult(null)
    const wa = selectedAgent?.whatsapp
    if (!wa?.phoneNumberId) {
      setTestResult({ ok: false, error: 'El agente no tiene WhatsApp configurado' })
      setLoading(false); return
    }
    try {
      const r = await fetch(`${SERVER}/test-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accId: account.id,
          agentId: selectedAgent.id,
          phoneNumberId: wa.phoneNumberId,
          from: '1234567890',
          fromName: 'Usuario de Prueba',
          text: testText,
        })
      })
      const d = await r.json()
      setTestResult({ ok: true, ...d })
      setTimeout(fetchDebug, 500)
    } catch (e) {
      setTestResult({ ok: false, error: e.message })
    }
    setLoading(false)
  }

  useEffect(() => { checkServer(); fetchDebug() }, [])

  // Read convos to show WA conversations
  const convos = readConvos(account?.id, selectedAgent?.id) || []
  const waConvos = convos.filter(c => c.channel === 'whatsapp')

  // Read agent config
  const wa = selectedAgent?.whatsapp
  const db = readDB()
  const dbAgent = db.accounts?.find(a => a.id === account?.id)?.agents?.find(a => a.id === selectedAgent?.id)
  const dbWA = dbAgent?.whatsapp

  return (
    <div className={s.panel}>
      <div className={s.title}>🔍 Diagnóstico WhatsApp</div>

      {/* Step-by-step checklist */}
      <div className={s.checklist}>
        <div className={s.checklistTitle}>Lista de verificación</div>

        <CheckItem
          ok={!!dbWA?.phoneNumberId}
          label="Phone Number ID configurado"
          detail={dbWA?.phoneNumberId || 'No configurado'}
        />
        <CheckItem
          ok={!!dbWA?.accessToken}
          label="Access Token configurado"
          detail={dbWA?.accessToken ? `${dbWA.accessToken.slice(0,16)}...` : 'No configurado'}
        />
        <CheckItem
          ok={dbWA?.status === 'connected'}
          label="Estado: conectado"
          detail={dbWA?.status || 'desconectado'}
        />
        <CheckItem
          ok={serverStatus?.ok}
          label={`Servidor webhook corriendo (${SERVER})`}
          detail={serverStatus ? (serverStatus.ok ? `✓ SSE clientes: ${serverStatus.sseClients}` : serverStatus.error) : 'Verificando...'}
        />
        <CheckItem
          ok={serverStatus?.sseClients > 0}
          label="Browser conectado al servidor (SSE)"
          detail={serverStatus?.sseClients > 0 ? `${serverStatus.sseClients} conexión(es) activa(s)` : 'No hay clientes SSE — ¿está abierto AVI Platform?'}
        />
        <CheckItem
          ok={waConvos.length > 0}
          label="Conversaciones de WhatsApp recibidas"
          detail={waConvos.length > 0 ? `${waConvos.length} conversación(es)` : 'Ninguna todavía'}
        />
      </div>

      {/* Server debug */}
      {serverDebug && (
        <div className={s.section}>
          <div className={s.sectionTitle}>Últimos mensajes en el servidor</div>
          {serverDebug.error ? (
            <div className={s.error}>{serverDebug.error}</div>
          ) : serverDebug.lastMessages?.length === 0 ? (
            <div className={s.empty}>El servidor no ha recibido mensajes aún.</div>
          ) : (
            serverDebug.lastMessages?.map((m, i) => (
              <div key={i} className={s.debugMsg}>
                <span className={s.debugTs}>{m.ts}</span>
                <span className={s.debugAcc}>acc:{m.accId?.slice(-6)} agent:{m.agentId?.slice(-6)}</span>
                {m.messages?.map((msg, j) => (
                  <div key={j} className={s.debugMsgText}>
                    📱 {msg.from} → "{msg.text}" ({msg.type})
                  </div>
                ))}
              </div>
            ))
          )}
          <button className={s.refreshBtn} onClick={fetchDebug}>↻ Actualizar</button>
        </div>
      )}

      {/* Test message */}
      <div className={s.section}>
        <div className={s.sectionTitle}>Inyectar mensaje de prueba</div>
        <p className={s.sectionDesc}>Envía un mensaje falso de WhatsApp para probar que el flujo completo funciona sin necesitar un teléfono real.</p>
        <div className={s.testRow}>
          <input value={testText} onChange={e => setTestText(e.target.value)} placeholder="Mensaje de prueba..." />
          <button className={s.testBtn} onClick={sendTestMessage} disabled={loading}>
            {loading ? '...' : '▶ Enviar prueba'}
          </button>
        </div>
        {testResult && (
          <div className={`${s.testResult} ${testResult.ok ? s.resultOk : s.resultErr}`}>
            {testResult.ok
              ? `✓ Inyectado. Clientes SSE notificados: ${testResult.sseClientsSent}. Revisa el inbox.`
              : `✗ ${testResult.error}`
            }
          </div>
        )}
      </div>

      {/* WA convos */}
      {waConvos.length > 0 && (
        <div className={s.section}>
          <div className={s.sectionTitle}>Conversaciones de WhatsApp ({waConvos.length})</div>
          {waConvos.map(c => (
            <div key={c.id} className={s.convoRow}>
              <span className={s.convoName}>{c.guestName}</span>
              <span className={s.convoFrom}>{c.waFrom}</span>
              <span className={s.convoCount}>{c.messages?.length || 0} msgs</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CheckItem({ ok, label, detail }) {
  return (
    <div className={s.checkItem}>
      <span className={ok ? s.checkOk : s.checkFail}>{ok ? '✓' : '✗'}</span>
      <div className={s.checkContent}>
        <div className={s.checkLabel}>{label}</div>
        <div className={s.checkDetail}>{detail}</div>
      </div>
    </div>
  )
}
