import FormattedMessage from './FormattedMessage'

// Tarjeta de "Enviar calendario": muestra el texto introductorio + un botón que
// abre la interfaz de reservas referenciada a este chat (?conv=…).
export default function CalendarMessage({ calendar, text }) {
  if (!calendar) return null
  const accent = calendar.color || '#7c6fff'
  const intro = String(text || '').replace(calendar.url || '', '').trim()
  return (
    <div>
      {intro && <div style={{ marginBottom: 8 }}><FormattedMessage text={intro} /></div>}
      <div style={{ border: `1px solid ${accent}55`, borderRadius: 12, overflow: 'hidden', minWidth: 200 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: `linear-gradient(135deg, ${accent}22, transparent)` }}>
          <span style={{ fontSize: 18 }}>🗓</span>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{calendar.name || 'Agendar cita'}</div>
        </div>
        {calendar.url && (
          <a href={calendar.url} target="_blank" rel="noreferrer"
            style={{ display: 'block', textAlign: 'center', padding: '10px 12px', background: accent, color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
            {calendar.buttonText || '📅 Agendar cita'}
          </a>
        )}
      </div>
    </div>
  )
}
