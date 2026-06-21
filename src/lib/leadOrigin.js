// Presentación del ORIGEN del lead (anuncio / link / directo) capturado al crear
// la conversación. Devuelve { icon, label, detail, color } o null.
const PLATFORM = {
  google: { name: 'Google', color: '#4285F4' },
  meta:   { name: 'Meta',   color: '#0866FF' },
}

export function formatLeadOrigin(origin, linkLabel) {
  if (!origin || !origin.type) return null
  const t = origin.type

  if (t === 'ad') {
    const p = PLATFORM[origin.platform]
    const detail = origin.adId ? `anuncio ${origin.adId}` : (origin.campaign || origin.source || '')
    return { icon: '📢', label: `Anuncio${p ? ' · ' + p.name : ''}`, detail, color: p?.color || '#0866FF' }
  }
  if (t === 'campaign') {
    const detail = [origin.source, origin.campaign].filter(Boolean).join(' · ')
    return { icon: '📈', label: 'Campaña', detail, color: '#f5a623' }
  }
  if (t === 'link') {
    return { icon: '🔗', label: 'Link', detail: linkLabel || origin.linkId || '', color: '#22d98a' }
  }
  return { icon: '✦', label: 'Directo', detail: '', color: 'var(--text3)' }
}

// Chip compacto para listas/encabezados. `linkLabel` se resuelve fuera (desde
// agent.links) porque aquí solo tenemos el id.
export function leadOriginChipProps(origin, linkLabel) {
  const f = formatLeadOrigin(origin, linkLabel)
  if (!f) return null
  return f
}
