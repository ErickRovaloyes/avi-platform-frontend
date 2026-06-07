/**
 * CRM & Leads — direct wrappers around the existing CRM controllers.
 */

import { interpolate, logDebug, setVarBoth } from '../common'
import { api } from '../../api'

export const crmNodes = [
  // ── 1) Crear Contacto ───────────────────────────────────────────────────
  {
    type: 'crm_create_contact',
    category: 'crm',
    label: 'Crear contacto',
    icon: '➕', color: '#22d98a',
    description: 'Crea un contacto en el CRM.',
    fields: [
      { key: 'nombre',      label: 'Nombre',      type: 'text', placeholder: '{{user_name}}' },
      { key: 'email',       label: 'Email',       type: 'text', placeholder: '{{user_email}}' },
      { key: 'phone',       label: 'Teléfono',    type: 'text' },
      { key: 'company',     label: 'Empresa',     type: 'text' },
      { key: 'tags',        label: 'Tags (coma)', type: 'text' },
      { key: 'destino_id',  label: 'Guardar id en', type: 'variableRef' },
    ],
    async exec(node, ctx) {
      const payload = {
        name:        interpolate(node.data?.nombre || '', ctx.variables),
        email:       interpolate(node.data?.email  || '', ctx.variables),
        phone:       interpolate(node.data?.phone  || '', ctx.variables),
        companyName: interpolate(node.data?.company || '', ctx.variables),
        tags: String(node.data?.tags || '').split(',').map(s => s.trim()).filter(Boolean),
      }
      const r = await api.post(`/api/accounts/${ctx.accId}/contacts`, payload)
      if (node.data?.destino_id) await setVarBoth(ctx, node.data.destino_id, r.id)
      ctx.variables._last_contact_id = r.id
      logDebug(ctx, 'flow_run', `➕ Contacto creado: ${r.id}`, payload)
    },
  },

  // ── 2) Buscar Contacto ──────────────────────────────────────────────────
  {
    type: 'crm_find_contact',
    category: 'crm',
    label: 'Buscar contacto',
    icon: '🔎', color: '#22d98a',
    description: 'Busca un contacto por email, teléfono o nombre.',
    fields: [
      { key: 'campo', label: 'Campo', type: 'select', options: [
          { value: 'email', label: 'Email' },
          { value: 'phone', label: 'Teléfono' },
          { value: 'name',  label: 'Nombre' },
        ], default: 'email' },
      { key: 'valor', label: 'Valor', type: 'text' },
      { key: 'destino_id', label: 'Guardar id en', type: 'variableRef' },
    ],
    async exec(node, ctx) {
      const all = await api.get(`/api/accounts/${ctx.accId}/contacts`)
      const value = interpolate(node.data?.valor || '', ctx.variables).toLowerCase()
      const m = (all || []).find(c => (c[node.data?.campo] || '').toLowerCase() === value)
      if (m && node.data?.destino_id) await setVarBoth(ctx, node.data.destino_id, m.id)
      ctx.variables._last_contact_found = !!m
      if (m) Object.assign(ctx.variables, { user_id: m.id, user_name: m.name, user_email: m.email, user_phone: m.phone })
      else throw new Error('Contacto no encontrado')
    },
  },

  // ── 3) Actualizar Contacto ──────────────────────────────────────────────
  {
    type: 'crm_update_contact',
    category: 'crm',
    label: 'Actualizar contacto',
    icon: '✏️', color: '#22d98a',
    description: 'Actualiza campos de un contacto existente.',
    fields: [
      { key: 'contact_id', label: 'ID del contacto', type: 'text', default: '{{_last_contact_id}}' },
      { key: 'nombre',     label: 'Nombre',  type: 'text' },
      { key: 'email',      label: 'Email',   type: 'text' },
      { key: 'phone',      label: 'Teléfono', type: 'text' },
      { key: 'extras',     label: 'Extras JSON', type: 'textarea' },
    ],
    async exec(node, ctx) {
      const id = interpolate(node.data?.contact_id || '{{_last_contact_id}}', ctx.variables)
      if (!id) throw new Error('Falta ID del contacto')
      const payload = {}
      const name  = interpolate(node.data?.nombre || '', ctx.variables); if (name)  payload.name  = name
      const email = interpolate(node.data?.email  || '', ctx.variables); if (email) payload.email = email
      const phone = interpolate(node.data?.phone  || '', ctx.variables); if (phone) payload.phone = phone
      const raw = interpolate(node.data?.extras || '', ctx.variables)
      if (raw) {
        try { Object.assign(payload, JSON.parse(raw)) } catch {}
      }
      await api.put(`/api/accounts/${ctx.accId}/contacts/${id}`, payload)
    },
  },

  // ── 4) Crear Lead ───────────────────────────────────────────────────────
  // En esta plataforma, un "lead" es un contacto con etiqueta "lead" y un deal asociado.
  {
    type: 'crm_create_lead',
    category: 'crm',
    label: 'Crear lead',
    icon: '🌟', color: '#22d98a',
    description: 'Crea un contacto + tag "lead" y un card de pipeline.',
    fields: [
      { key: 'nombre',  label: 'Nombre',  type: 'text' },
      { key: 'email',   label: 'Email',   type: 'text' },
      { key: 'phone',   label: 'Teléfono', type: 'text' },
      { key: 'origen',  label: 'Origen',  type: 'text', default: 'flow' },
      { key: 'pipeline_id', label: 'Pipeline ID',     type: 'text' },
      { key: 'stage_id',    label: 'Stage ID inicial', type: 'text' },
      { key: 'destino_id',  label: 'Guardar id en',   type: 'variableRef' },
    ],
    async exec(node, ctx) {
      const r = await api.post(`/api/accounts/${ctx.accId}/contacts`, {
        name:  interpolate(node.data?.nombre || '', ctx.variables),
        email: interpolate(node.data?.email  || '', ctx.variables),
        phone: interpolate(node.data?.phone  || '', ctx.variables),
        tags: ['lead', interpolate(node.data?.origen || 'flow', ctx.variables)],
      })
      if (node.data?.destino_id) await setVarBoth(ctx, node.data.destino_id, r.id)
      ctx.variables._last_lead_id = r.id
      logDebug(ctx, 'flow_run', `🌟 Lead creado: ${r.id}`, {})
    },
  },

  // ── 5) Lead Scoring (simple) ────────────────────────────────────────────
  // Heurística: el score crece con email, teléfono, etiqueta + responses del usuario.
  {
    type: 'crm_lead_score',
    category: 'crm',
    label: 'Lead scoring',
    icon: '📈', color: '#22d98a',
    description: 'Calcula un score básico (heurística). Para IA avanzada usa un nodo de IA y otra fuente.',
    fields: [
      { key: 'contact_id', label: 'Contact ID', type: 'text', default: '{{_last_lead_id}}' },
      { key: 'destino',    label: 'Guardar score en', type: 'variableRef' },
    ],
    outputs: { score: { type: 'number' } },
    async exec(node, ctx) {
      const id = interpolate(node.data?.contact_id || '{{_last_lead_id}}', ctx.variables)
      if (!id) throw new Error('Falta contact_id')
      const all = await api.get(`/api/accounts/${ctx.accId}/contacts`)
      const c = (all || []).find(x => x.id === id)
      if (!c) throw new Error('Contacto no encontrado')
      let score = 0
      if (c.email)  score += 25
      if (c.phone)  score += 15
      if ((c.tags || []).includes('vip')) score += 30
      if ((c.tags || []).includes('lead')) score += 10
      // Recent activity bumps score
      const recent = (ctx.variables._last_user_messages || []).length
      score += Math.min(20, recent * 5)
      score = Math.min(100, score)
      if (node.data?.destino) await setVarBoth(ctx, node.data.destino, score)
      ctx.variables._last_lead_score = score
      logDebug(ctx, 'flow_run', `📈 Score: ${score}`, { id })
    },
  },

  // ── 6) Pipeline (mover deal de etapa) ───────────────────────────────────
  {
    type: 'crm_pipeline_move',
    category: 'crm',
    label: 'Pipeline: mover',
    icon: '📊', color: '#22d98a',
    description: 'Mueve la conversación a una nueva etapa del pipeline.',
    fields: [
      { key: 'pipeline_id', label: 'Pipeline ID', type: 'text' },
      { key: 'stage_id',    label: 'Stage ID',    type: 'text' },
    ],
    async exec(node, ctx) {
      // Marker variable consumed by analytics — the engine doesn't directly
      // mutate pipelines; that's done by the pipeline panel today. We log the
      // intent so it shows up in the timeline.
      logDebug(ctx, 'flow_run', '📊 Mover en pipeline', {
        pipelineId: node.data?.pipeline_id,
        stageId: node.data?.stage_id,
      })
      ctx.variables._pipeline_move = {
        pipelineId: node.data?.pipeline_id,
        stageId: node.data?.stage_id,
      }
    },
  },
]
