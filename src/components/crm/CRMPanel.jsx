import { useState } from 'react'
import { useAccount } from '../../context/AccountContext'
import PipelinePanel       from '../pipeline/PipelinePanel'
import CRMDashboard        from './CRMDashboard'
import CRMContactsPanel    from './CRMContactsPanel'
import CRMTasksPanel       from './CRMTasksPanel'
import N8NIntegrationsPanel from '../n8n/N8NIntegrationsPanel'
import ApiKeysPanel        from '../n8n/ApiKeysPanel'
import s from './CRMPanel.module.css'

export default function CRMPanel() {
  const { account } = useAccount()
  const [tab, setTab] = useState('dashboard')

  const TABS = [
    { id: 'dashboard',    label: '📊 Dashboard' },
    { id: 'pipeline',     label: '🧲 Pipeline' },
    { id: 'contacts',     label: '👥 Contactos' },
    { id: 'tasks',        label: '✅ Tareas' },
    { id: 'integrations', label: '🔗 Integraciones' },
  ]

  return (
    <div className={s.panel}>
      <div className={s.tabs}>
        {TABS.map(t => (
          <button key={t.id} className={`${s.tab} ${tab === t.id ? s.tabActive : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className={s.content}>
        {tab === 'dashboard' && <CRMDashboard />}
        {tab === 'pipeline'  && <PipelinePanel />}
        {tab === 'contacts'  && <CRMContactsPanel />}
        {tab === 'tasks'     && <CRMTasksPanel />}
        {tab === 'integrations' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '0' }}>
            <N8NIntegrationsPanel scope="account" accountId={account?.id} />
            <ApiKeysPanel accountId={account?.id} />
          </div>
        )}
      </div>
    </div>
  )
}
