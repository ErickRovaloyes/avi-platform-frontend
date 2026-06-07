/**
 * Analytics — write events to the crm_activity timeline so they show up in
 * the CRM dashboard and timelines automatically.
 */

import { api } from '../../api'
import { interpolate, logDebug } from '../common'

async function logCrmActivity(ctx, { kind, title, detail }) {
  // We don't have a dedicated public endpoint for activity insert, but notes
  // and tasks already create activity entries via crm.controller.logActivity().
  // For ad-hoc events we piggyback on the notes endpoint with a marker prefix.
  try {
    await api.post(`/api/accounts/${ctx.accId}/crm/notes`, {
      targetType: 'conversation', targetId: ctx.convId,
      content: `[${kind}] ${title}${detail ? ' · ' + detail : ''}`,
    })
  } catch {}
}

export const analyticsNodes = [
  // ── 1) Evento ───────────────────────────────────────────────────────────
  {
    type: 'analytics_event',
    category: 'analytics',
    label: 'Evento analytics',
    icon: '📌', color: '#22d98a',
    description: 'Registra un evento de negocio en la línea de tiempo.',
    fields: [
      { key: 'evento',     label: 'Nombre del evento', type: 'text', placeholder: 'lead_generado' },
      { key: 'propiedades', label: 'Propiedades JSON', type: 'textarea', placeholder: '{"origen":"flow","valor":100}' },
    ],
    async exec(node, ctx) {
      const name = interpolate(node.data?.evento || '', ctx.variables) || 'evento'
      const props = interpolate(node.data?.propiedades || '', ctx.variables)
      await logCrmActivity(ctx, { kind: 'event', title: name, detail: props })
      logDebug(ctx, 'flow_run', `📌 evento: ${name}`, { props })
    },
  },

  // ── 2) Conversión ───────────────────────────────────────────────────────
  {
    type: 'analytics_conversion',
    category: 'analytics',
    label: 'Conversión',
    icon: '🎯', color: '#22d98a',
    description: 'Marca un punto de conversión con valor opcional.',
    fields: [
      { key: 'nombre', label: 'Nombre',  type: 'text', placeholder: 'compra_confirmada' },
      { key: 'valor',  label: 'Valor',   type: 'text', placeholder: '49.99' },
      { key: 'moneda', label: 'Moneda',  type: 'text', default: 'USD' },
    ],
    async exec(node, ctx) {
      const name  = interpolate(node.data?.nombre || '', ctx.variables) || 'conversion'
      const valor = interpolate(node.data?.valor  || '', ctx.variables)
      const moneda = node.data?.moneda || 'USD'
      await logCrmActivity(ctx, { kind: 'conversion', title: name, detail: `${valor} ${moneda}` })
      ctx.variables._last_conversion = { name, value: Number(valor) || 0, currency: moneda }
    },
  },

  // ── 3) KPI ──────────────────────────────────────────────────────────────
  {
    type: 'analytics_kpi',
    category: 'analytics',
    label: 'KPI',
    icon: '📊', color: '#22d98a',
    description: 'Incrementa o setea un KPI nombrado.',
    fields: [
      { key: 'kpi',      label: 'Nombre del KPI', type: 'text' },
      { key: 'operacion', label: 'Operación', type: 'select', options: [
          { value: 'inc',   label: 'Incrementar' },
          { value: 'set',   label: 'Asignar' },
        ], default: 'inc' },
      { key: 'valor',    label: 'Valor', type: 'text', default: '1' },
    ],
    async exec(node, ctx) {
      const name = node.data?.kpi
      if (!name) return
      const op = node.data?.operacion || 'inc'
      const val = Number(interpolate(node.data?.valor || '1', ctx.variables)) || 1
      await logCrmActivity(ctx, { kind: 'kpi', title: `${name} ${op} ${val}` })
    },
  },

  // ── 4) Dashboard (stub) ─────────────────────────────────────────────────
  {
    type: 'analytics_dashboard',
    category: 'analytics',
    label: 'Dashboard',
    icon: '📈', color: '#888',
    description: 'Envía un snapshot a un dashboard externo. (Próximamente)',
    stub: true,
    fields: [
      { key: 'dashboard_id', label: 'Dashboard ID', type: 'text' },
    ],
    async exec() {
      throw new Error('Dashboard externo aún no implementado — usa los Metrics existentes en /plataforma.')
    },
  },

  // ── 5) Auditoría ────────────────────────────────────────────────────────
  {
    type: 'analytics_audit',
    category: 'analytics',
    label: 'Auditoría',
    icon: '🕵', color: '#22d98a',
    description: 'Registra una acción auditable con quién, cuándo y qué.',
    fields: [
      { key: 'accion',  label: 'Acción', type: 'text' },
      { key: 'detalle', label: 'Detalle', type: 'textarea' },
    ],
    async exec(node, ctx) {
      const accion = interpolate(node.data?.accion || '', ctx.variables) || 'action'
      const detalle = interpolate(node.data?.detalle || '', ctx.variables)
      await logCrmActivity(ctx, { kind: 'audit', title: accion, detail: detalle })
    },
  },
]
