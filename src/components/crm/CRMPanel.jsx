import { useState } from 'react'
import { useAccount } from '../../context/AccountContext'
import PipelinePanel       from '../pipeline/PipelinePanel'
import CRMDashboard        from './CRMDashboard'
import CRMContactsPanel    from './CRMContactsPanel'
import CRMCopilotPanel     from './CRMCopilotPanel'
import CRMSegmentsPanel    from './CRMSegmentsPanel'
import CRMTasksPanel       from './CRMTasksPanel'
import ApiKeysPanel        from '../integrations/ApiKeysPanel'
import s from './CRMPanel.module.css'

export default function CRMPanel() {
  const { account } = useAccount()
  const [tab, setTab] = useState('dashboard')

  const TABS = [
    { id: 'dashboard',    label: '📊 Dashboard' },
    { id: 'copilot',      label: '🤖 Copiloto' },
    { id: 'pipeline',     label: '🧲 Pipeline' },
    { id: 'contacts',     label: '👥 Contactos' },
    { id: 'segments',     label: '🎯 Segmentos' },
    { id: 'tasks',        label: '✅ Tareas' },
    { id: 'integrations', label: '🔗 Integraciones' },
  ]

  return (
    <div className={s.panel}>
      <select className="mobileSelect" value={tab} onChange={e => setTab(e.target.value)}>
        {TABS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
      </select>
      <div className={`${s.tabs} onlyDesktop`}>
        {TABS.map(t => (
          <button key={t.id} className={`${s.tab} ${tab === t.id ? s.tabActive : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className={s.content}>
        {tab === 'dashboard' && <CRMDashboard />}
        {tab === 'copilot'   && <CRMCopilotPanel />}
        {tab === 'pipeline'  && <PipelinePanel />}
        {tab === 'contacts'  && <CRMContactsPanel />}
        {tab === 'segments'  && <CRMSegmentsPanel />}
        {tab === 'tasks'     && <CRMTasksPanel />}
        {tab === 'integrations' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '0' }}>
            <ApiKeysPanel accountId={account?.id} />
          </div>
        )}
      </div>
    </div>
  )
}
