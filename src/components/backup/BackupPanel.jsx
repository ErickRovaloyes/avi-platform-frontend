import { useState, useEffect } from 'react'
import { useAccount } from '../../context/AccountContext'
import { readBackups, createBackup, deleteBackup, restoreBackup, getBackupSettings, saveBackupSettings, checkAndAutoBackup, getBackupData } from '../../lib/storage'
import s from './BackupPanel.module.css'

const FREQ_LABELS = { hourly: 'Cada hora', daily: 'Diario', weekly: 'Semanal' }

export default function BackupPanel() {
  const { account, selectedAgent } = useAccount()
  const accId = account?.id
  const agId = selectedAgent?.id

  const [backups, setBackups] = useState([])
  const [cfg, setCfg] = useState({ autoBackup: false, frequency: 'daily', lastBackupAt: null })
  const [label, setLabel] = useState('')
  const [toast, setToast] = useState('')
  const [restoreId, setRestoreId] = useState(null)
  const [backupTab, setBackupTab] = useState('master') // 'master' | 'flash'

  useEffect(() => {
    if (!accId || !agId) return
    reload()
    checkAndAutoBackup(accId, agId)
  }, [accId, agId])

  function flash(msg) { setToast(msg); setTimeout(() => setToast(''), 3000) }

  async function reload() {
    const [bks, settings] = await Promise.all([
      readBackups(accId, agId),
      getBackupSettings(accId, agId).catch(() => null),
    ])
    setBackups(bks || [])
    if (settings) setCfg(prev => ({ ...prev, ...settings }))
  }

  async function handleCreate() {
    await createBackup(accId, agId, label.trim() || undefined)
    setLabel('')
    await reload()
    flash('Backup creado ✓')
  }

  async function handleDelete(id) {
    await deleteBackup(accId, agId, id)
    await reload()
    flash('Backup eliminado')
  }

  async function handleRestore(id) {
    if (restoreId !== id) { setRestoreId(id); return }
    await restoreBackup(accId, agId, id)
    setRestoreId(null)
    await reload()
    flash('Restaurado ✓ — recarga la página para ver los cambios')
  }

  async function handleExport(backup) {
    try {
      // La lista de backups no incluye el JSON (sería enorme): lo pedimos ahora.
      const data = await getBackupData(accId, agId, backup.id)
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `avi-backup-${selectedAgent?.name?.toLowerCase().replace(/\s+/g, '-')}-${new Date(backup.ts).toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) { flash('No se pudo exportar el backup: ' + (e.message || 'error')) }
  }

  function handleImport(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async ev => {
      try {
        const parsed = JSON.parse(ev.target.result)
        const data = parsed.agent ? parsed : { agent: parsed, accountSettings: {} }
        await createBackup(accId, agId, 'Importado: ' + file.name)
        await reload()
        flash('Backup importado ✓ — usa Restaurar para aplicarlo')
      } catch { flash('Error: archivo inválido') }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  async function saveCfg(next) {
    const merged = { ...cfg, ...next }
    setCfg(merged)
    await saveBackupSettings(accId, agId, merged)
    flash('Configuración guardada ✓')
  }

  function fmtSize(bytes) {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / 1048576).toFixed(2) + ' MB'
  }

  function fmtDate(ts) {
    return new Date(ts).toLocaleString('es', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  if (!agId) return <div className={s.panel}><p style={{padding:24,color:'var(--text3)'}}>Selecciona un agente para gestionar sus backups.</p></div>

  return (
    <div className={s.panel}>
      {toast && <div className={s.toast}>{toast}</div>}

      <div className={s.header}>
        <div>
          <h2 className={s.title}>Backups — {selectedAgent?.name}</h2>
          <p className={s.sub}>Guarda y restaura el estado completo de este agente IA</p>
        </div>
      </div>

      {/* Auto-backup settings */}
      <div className={s.card}>
        <div className={s.cardTitle}>⚙️ Configuración automática</div>
        <div className={s.row}>
          <label className={s.toggle}>
            <input type="checkbox" checked={cfg.autoBackup}
              onChange={e => saveCfg({ autoBackup: e.target.checked })} />
            <span className={s.toggleTrack}><span className={s.toggleThumb} /></span>
            Backup automático
          </label>
          {cfg.autoBackup && (
            <select className={s.select} value={cfg.frequency}
              onChange={e => saveCfg({ frequency: e.target.value })}>
              {Object.entries(FREQ_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          )}
          {cfg.lastBackupAt && (
            <span className={s.lastSaved}>Último auto-backup: {fmtDate(cfg.lastBackupAt)}</span>
          )}
        </div>
      </div>

      {/* Manual backup */}
      <div className={s.card}>
        <div className={s.cardTitle}>💾 Backup manual</div>
        <div className={s.row}>
          <input className={s.input} placeholder="Etiqueta (opcional)..." value={label}
            onChange={e => setLabel(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()} />
          <button className={s.btn} onClick={handleCreate}>Crear backup</button>
          <div className={s.divider} />
          <label className={s.importBtn}>
            📂 Importar JSON
            <input type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
          </label>
        </div>
      </div>

      {/* Backup tabs */}
      <div className={s.card}>
        <div style={{ display: 'flex', gap: 4, marginBottom: 12, borderBottom: '1px solid var(--border)' }}>
          {[
            { id: 'master', label: '📦 Master', max: 10, hint: 'Manuales y programados' },
            { id: 'flash',  label: '⚡ Flash',  max: 100, hint: 'Automáticos antes de cambios riesgosos' },
          ].map(t => {
            const isActive = backupTab === t.id
            const count = backups.filter(b => (b.type || 'master') === t.id).length
            return (
              <button key={t.id}
                onClick={() => setBackupTab(t.id)}
                style={{
                  padding: '8px 14px', border: 'none', background: 'transparent',
                  color: isActive ? 'var(--text1)' : 'var(--text3)',
                  borderBottom: '2px solid ' + (isActive ? (t.id === 'flash' ? '#f5a623' : 'var(--accent)') : 'transparent'),
                  cursor: 'pointer', fontSize: 13, fontWeight: isActive ? 600 : 500,
                }}>
                {t.label} <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 4 }}>({count}/{t.max})</span>
              </button>
            )
          })}
          <span style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 11, color: 'var(--text3)' }}>
            {backupTab === 'flash'
              ? 'Creados automáticamente antes de cambios riesgosos (prompts, flujos). Máx. 100, rotación FIFO.'
              : 'Backups manuales y programados. Máx. 10.'}
          </span>
        </div>

        {(() => {
          const visible = backups.filter(b => (b.type || 'master') === backupTab)
          if (visible.length === 0) return <div className={s.empty}>Sin backups {backupTab === 'flash' ? 'flash todavía. Aparecerán automáticamente cuando ejecutes cambios desde el Agente de Cambios u otros panels.' : 'master. Crea el primero arriba.'}</div>
          return visible.map(bk => (
            <div key={bk.id} className={s.backupRow}>
              <div className={s.bkInfo}>
                <div className={s.bkLabel}>
                  {bk.type === 'flash' && <span style={{ color: '#f5a623', marginRight: 6 }}>⚡</span>}
                  {bk.label}
                </div>
                <div className={s.bkMeta}>{fmtDate(bk.ts)} · {fmtSize(bk.sizeBytes)}</div>
              </div>
              <div className={s.bkActions}>
                <button className={s.actionBtn} onClick={() => handleExport(bk)}>↓ Exportar</button>
                <button
                  className={`${s.actionBtn} ${restoreId === bk.id ? s.actionBtnWarn : ''}`}
                  onClick={() => handleRestore(bk.id)}
                  title={restoreId === bk.id ? 'Haz clic de nuevo para confirmar' : 'Restaurar este backup'}
                >
                  {restoreId === bk.id ? '⚠ Confirmar restaurar' : '↺ Restaurar'}
                </button>
                <button className={`${s.actionBtn} ${s.actionBtnDanger}`} onClick={() => handleDelete(bk.id)}>✕</button>
              </div>
            </div>
          ))
        })()}
      </div>
    </div>
  )
}
