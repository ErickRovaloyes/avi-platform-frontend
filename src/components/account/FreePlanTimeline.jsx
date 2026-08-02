// Línea de tiempo de las 3 etapas del Plan Gratuito (Demo). Dinámica según la config del tipo
// (free_stages) y la antigüedad de la cuenta (freeStartedAt). Resalta la etapa actual, indica
// cuántos días faltan para la siguiente y, en la etapa final, el consumo de contactos.
const DAY = 86400000
const DEFAULT_STAGES = [
  { label: 'Agente IA completo', days: 15, aiEnabled: true,  moduleSet: 'all',       contactLimit: 400,  hardBlock: false },
  { label: 'CRM completo',       days: 15, aiEnabled: false, moduleSet: 'crm',       contactLimit: 1000, hardBlock: false },
  { label: 'CRM limitado',       days: 0,  aiEnabled: false, moduleSet: 'crm_basic', contactLimit: 100,  hardBlock: true  },
]
const PHASE_INDEX = { agente_starter: 0, crm_starter: 1, month2: -1 } // -1 = última etapa

const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`

export default function FreePlanTimeline({ freeStartedAt, phase, stages, contactCount = 0, contactLimit = 0 }) {
  const st = Array.isArray(stages) && stages.length ? stages : DEFAULT_STAGES
  const lastIdx = st.length - 1
  const started = Number(freeStartedAt) || Date.now()
  const ageDays = (Date.now() - started) / DAY
  const cumDays = i => st.slice(0, i + 1).reduce((a, s) => a + (Number(s.days) || 0), 0)

  // Etapa actual: por `phase` si viene, si no por antigüedad (cortes acumulativos).
  let cur
  if (phase && phase in PHASE_INDEX) cur = PHASE_INDEX[phase] === -1 ? lastIdx : PHASE_INDEX[phase]
  else {
    cur = lastIdx
    for (let i = 0; i < lastIdx; i++) { if (ageDays < cumDays(i)) { cur = i; break } }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, textAlign: 'left' }}>
      {st.map((s, i) => {
        const status = i < cur ? 'done' : i === cur ? 'active' : 'upcoming'
        const isLast = i === lastIdx
        const daysLeft = Math.max(0, Math.ceil(cumDays(i) - ageDays))
        const limit = Number(s.contactLimit) || 0
        const dot = status === 'done' ? 'var(--green)' : status === 'active' ? 'var(--accent)' : 'var(--border2)'
        const txt = status === 'upcoming' ? 'var(--text3)' : 'var(--text)'
        return (
          <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            {/* Riel + nodo */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', alignSelf: 'stretch' }}>
              <div style={{
                width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                background: status === 'active' ? 'var(--accent)' : status === 'done' ? 'var(--green)' : 'var(--bg3)',
                border: `2px solid ${dot}`, color: status === 'upcoming' ? 'var(--text3)' : '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
              }}>{status === 'done' ? '✓' : i + 1}</div>
              {!isLast && <div style={{ width: 2, flex: 1, minHeight: 16, background: i < cur ? 'var(--green)' : 'var(--border2)' }} />}
            </div>
            {/* Contenido */}
            <div style={{ paddingBottom: isLast ? 0 : 14, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 13.5, color: txt }}>{s.label || `Etapa ${i + 1}`}</strong>
                {status === 'active' && <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 20, padding: '1px 7px' }}>ACTUAL</span>}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 2 }}>
                {isLast ? 'Desde el mes 2 · indefinida' : (i === 0 ? `Primeros ${plural(s.days || 0, 'día', 'días')}` : `Siguientes ${plural(s.days || 0, 'día', 'días')}`)}
                {' · '}{s.aiEnabled ? '🤖 IA activa' : '🚫 sin IA'}
                {limit > 0 && ` · hasta ${limit} contactos`}
                {isLast && s.hardBlock && ' · luego bloqueo'}
              </div>
              {status === 'active' && (
                <div style={{ fontSize: 11.5, color: 'var(--accent)', marginTop: 3, fontWeight: 600 }}>
                  {isLast
                    ? (limit > 0 ? `${contactLimit || limit ? `${contactCount}/${contactLimit || limit}` : contactCount} contactos usados` : `${contactCount} contactos`)
                    : `Faltan ${plural(daysLeft, 'día', 'días')} para pasar a la siguiente etapa`}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
