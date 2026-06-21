import { useState } from 'react'
import { useAccount } from '../../context/AccountContext'
import { AIToolsPanel } from './VariablesPanel'
import { VariablesPanel } from './VariablesPanel'
import KnowledgeBasePanel from '../knowledge/KnowledgeBasePanel'
import PromptsPanel from './PromptsPanel'
import CmsPanel from './CmsPanel'
import { AgentTab } from './ConfigPanel'
import s from './ZonaIAPanel.module.css'

const SUBTABS = [
  { id: 'agent',     icon: '⚙️', label: 'Configuración' },
  { id: 'prompts',   icon: '📋', label: 'Prompts' },
  { id: 'tools',     icon: '🛠', label: 'Herramientas IA' },
  { id: 'variables', icon: '📦', label: 'Variables' },
  { id: 'knowledge', icon: '📚', label: 'Conocimiento' },
  { id: 'cms',       icon: '📁', label: 'CMS' },
]

export default function ZonaIAPanel() {
  const [sub, setSub] = useState('agent')
  const { account, selectedAgent, updateAgent, deleteAgent } = useAccount()
  const [toast, setToast] = useState('')
  function flash(m) { setToast(m); setTimeout(() => setToast(''), 2400) }

  return (
    <div className={s.panel}>
      {toast && <div className={s.toast}>{toast}</div>}
      <div className={s.subTabs}>
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
        {sub === 'tools'     && <AIToolsPanel embedded />}
        {sub === 'variables' && <VariablesPanel embedded />}
        {sub === 'knowledge' && <KnowledgeBasePanel />}
        {sub === 'cms'       && <CmsPanel />}
      </div>
    </div>
  )
}
