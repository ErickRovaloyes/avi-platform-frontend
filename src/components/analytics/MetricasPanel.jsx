import { useState } from 'react'
import MetricsPanel from './MetricsPanel'
import TokenUsagePanel from './TokenUsagePanel'
import PromptHistoryPanel from './PromptHistoryPanel'
import s from './MetricasPanel.module.css'

const SUBTABS = [
  { id: 'metrics', icon: '📈', label: 'Métricas de negocio' },
  { id: 'tokens',  icon: '🪙', label: 'Tokens y costos' },
  { id: 'history', icon: '🕘', label: 'Historial de prompts' },
]

export default function MetricasPanel() {
  const [sub, setSub] = useState('metrics')
  return (
    <div className={s.panel}>
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
        {sub === 'metrics' && <MetricsPanel />}
        {sub === 'tokens'  && <TokenUsagePanel />}
        {sub === 'history' && <PromptHistoryPanel />}
      </div>
    </div>
  )
}
