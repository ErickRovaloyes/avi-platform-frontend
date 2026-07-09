import { useState } from 'react'
import { useAccount } from '../../context/AccountContext'
import { AIToolsPanel } from './VariablesPanel'
import { VariablesPanel } from './VariablesPanel'
import KnowledgeBasePanel from '../knowledge/KnowledgeBasePanel'
import PromptsPanel from './PromptsPanel'
import CmsPanel from './CmsPanel'
import StorePanel from './StorePanel'
import AgendaPanel from './AgendaPanel'
import PmsPanel from './PmsPanel'
import PaymentsPanel from './PaymentsPanel'
import OptimizerPanel from '../optimizer/OptimizerPanel'
import RecontactPanel from '../recontact/RecontactPanel'
import { AgentTab } from './ConfigPanel'
import s from './ZonaIAPanel.module.css'

const SUBTABS = [
  { id: 'agent',     icon: '⚙️', label: 'Configuración' },
  { id: 'prompts',   icon: '📋', label: 'Prompts' },
  { id: 'optimizer', icon: '🧠', label: 'Optimizador' },
  { id: 'tools',     icon: '🛠', label: 'Herramientas IA' },
  { id: 'variables', icon: '📦', label: 'Variables' },
  { id: 'knowledge', icon: '📚', label: 'Conocimiento' },
  { id: 'cms',       icon: '📁', label: 'CMS' },
  { id: 'store',     icon: '🛒', label: 'Tienda' },
  { id: 'agenda',    icon: '🗓', label: 'Agenda' },
  { id: 'pms',       icon: '🏨', label: 'PMS' },
  { id: 'payments',  icon: '💳', label: 'Pasarela de pago' },
  { id: 'recontact', icon: '🔁', label: 'Recontactos' },
]

export default function ZonaIAPanel() {
  const [sub, setSub] = useState('agent')
  const { account, selectedAgent, updateAgent, deleteAgent } = useAccount()
  const [toast, setToast] = useState('')
  function flash(m) { setToast(m); setTimeout(() => setToast(''), 2400) }

  return (
    <div className={s.panel}>
      {toast && <div className={s.toast}>{toast}</div>}
      {/* Móvil: selector desplegable de secciones */}
      <select className="mobileSelect" value={sub} onChange={e => setSub(e.target.value)}>
        {SUBTABS.map(t => <option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
      </select>
      <div className={`${s.subTabs} onlyDesktop`}>
        {SUBTABS.map(t => (
          <button
            key={t.id}
            className={`${s.tab} ${sub === t.id ? s.tabActive : ''}`}
            onClick={() => setSub(t.id)}
          >
            <span className={s.tabIcon}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>
      <div className={s.body}>
        {sub === 'agent'     && <AgentTab agent={selectedAgent} account={account} updateAgent={updateAgent} deleteAgent={deleteAgent} flash={flash} />}
        {sub === 'prompts'   && <PromptsPanel agentId={selectedAgent?.id} />}
        {sub === 'optimizer' && <OptimizerPanel agent={selectedAgent} account={account} />}
        {sub === 'tools'     && <AIToolsPanel embedded />}
        {sub === 'variables' && <VariablesPanel embedded />}
        {sub === 'knowledge' && <KnowledgeBasePanel />}
        {sub === 'cms'       && <CmsPanel />}
        {sub === 'store'     && <StorePanel />}
        {sub === 'agenda'    && <AgendaPanel />}
        {sub === 'pms'       && <PmsPanel />}
        {sub === 'payments'  && <PaymentsPanel />}
        {sub === 'recontact' && <RecontactPanel />}
      </div>
    </div>
  )
}
