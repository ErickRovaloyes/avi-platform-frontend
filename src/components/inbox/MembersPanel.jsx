import { useState, useEffect } from 'react'
import { useAccount } from '../../context/AccountContext'
import { useAuth } from '../../context/AuthContext'
import { createInvite, listInvites, revokeInvite } from '../../lib/storage'
import s from './MembersPanel.module.css'

const ALL_PERMS = [
  { id: 'inbox',     label: 'Inbox',          desc: 'Ver y responder conversaciones' },
  { id: 'agents',    label: 'Agentes IA',     desc: 'Editar configuración del agente' },
  { id: 'links',     label: 'Links',          desc: 'Gestionar links de webchat' },
  { id: 'crm',       label: 'CRM',            desc: 'Etiquetas y contactos' },
  { id: 'pipeline',  label: 'Pipeline',       desc: 'Embudo de ventas' },
  { id: 'flows',     label: 'Flujos',         desc: 'Automatización de flujos' },
  { id: 'variables', label: 'Variables',      desc: 'Variables personalizadas' },
  { id: 'tools',     label: 'Herramientas',   desc: 'Gestionar herramientas IA' },
  { id: 'config',    label: 'Config',         desc: 'Ajustes de cuenta y API Keys' },
  { id: 'admins',    label: 'Equipo & Roles', desc: 'Invitar miembros y gestionar roles' },
]

export default function MembersPanel() {
  const { account, selectedAgent, visibleAgents, updateMember, deleteMember, addRole, updateRole, deleteRole, reloadDB } = useAccount()
  const { session, joinAsOwner } = useAuth()
  const [view, setView] = useState('members')
  const [joining, setJoining] = useState(false)
  // Un super admin (directo o impersonando) puede unirse a esta cuenta como owner.
  const isSuperAdmin = session?.type === 'superadmin' || session?.isImpersonating
  const [showNewRole, setShowNewRole] = useState(false)
  const [nr, setNr] = useState({ name: '', permissions: {} })
  const [toast, setToast] = useState('')
  const [inviteRoleId, setInviteRoleId] = useState('')
  const [generatedLink, setGeneratedLink] = useState(null)
  const [invites, setInvites] = useState([])

  useEffect(() => {
    if (account?.id) listInvites(account.id).then(setInvites).catch(() => setInvites([]))
  }, [account?.id])

  function flash(m) { setToast(m); setTimeout(() => setToast(''), 2500) }

  async function handleJoinAsOwner() {
    if (!account?.id || joining) return
    const already = (account.members || []).some(m => (m.email || '').toLowerCase() === (session?.saEmail || session?.email || '').toLowerCase())
    if (!confirm(already
      ? '¿Entrar a esta cuenta como owner con tu usuario real?'
      : '¿Unirte a esta cuenta como owner? Entrarás con tu usuario real (dejas la vista de super admin).')) return
    setJoining(true)
    try {
      const r = await joinAsOwner(account.id)
      // La sesión ya es la de owner real; recarga la cuenta con la nueva identidad.
      await reloadDB()
      flash(r?.existed ? 'Entraste como owner ✓' : 'Te uniste como owner ✓')
    } catch (e) { flash('Error: ' + (e.message || 'no se pudo unir')); setJoining(false) }
  }

  async function handleGenerateInvite() {
    const roleId = inviteRoleId || roles[0]?.id
    if (!roleId) return
    const token = await createInvite({ accountId: account.id, agentId: selectedAgent?.id || null, roleId, createdBy: session?.name })
    const link = `${window.location.origin}/invite/${token}`
    setGeneratedLink(link)
    const updated = await listInvites(account.id).catch(() => [])
    setInvites(updated)
    flash('Enlace generado ✓')
  }

  async function handleRevokeInvite(token) {
    await revokeInvite(token)
    const updated = await listInvites(account.id).catch(() => [])
    setInvites(updated)
    flash('Invitación revocada')
  }

  const members = account?.members || []
  const roles = account?.roles || []

  function handleAddRole(e) {
    e.preventDefault()
    addRole(nr)
    setNr({ name: '', permissions: {} })
    setShowNewRole(false)
    flash('Rol creado ✓')
  }

  function togglePerm(roleId, perm) {
    const role = roles.find(r => r.id === roleId)
    if (!role || role.isSystem) return
    updateRole(roleId, { permissions: { ...role.permissions, [perm]: !role.permissions?.[perm] } })
  }

  function toggleNewPerm(perm) {
    setNr(p => ({ ...p, permissions: { ...p.permissions, [perm]: !p.permissions?.[perm] } }))
  }

  return (
    <div className={s.panel}>
      {toast && <div className={s.toast}>{toast}</div>}

      <div className={s.header}>
        <h2 className={s.title}>Equipo & Roles</h2>
        <p className={s.sub}>Invita miembros, asigna roles y define permisos granulares por sección.</p>
      </div>

      <div className={s.viewToggle}>
        <button className={`${s.viewBtn} ${view === 'members' ? s.viewActive : ''}`} onClick={() => setView('members')}>
          👥 Miembros ({members.length})
        </button>
        <button className={`${s.viewBtn} ${view === 'roles' ? s.viewActive : ''}`} onClick={() => setView('roles')}>
          🔐 Roles ({roles.length})
        </button>
        <button className={`${s.viewBtn} ${view === 'invites' ? s.viewActive : ''}`} onClick={() => setView('invites')}>
          🔗 Invitaciones ({invites.filter(i => !i.usedAt).length} activas)
        </button>
      </div>

      {/* ── Members ── */}
      {view === 'members' && (
        <div className={s.section}>
          <div className={s.sectionHeader}>
            <div className={s.sectionTitle}>Miembros del equipo</div>
            {isSuperAdmin && (
              <button className={s.addBtn} onClick={handleJoinAsOwner} disabled={joining} title="Crea tu membresía real como owner de esta cuenta">
                {joining ? 'Uniéndote…' : '👑 Unirme como owner'}
              </button>
            )}
          </div>

          <div className={s.memberList}>
            {members.length === 0 && <div className={s.empty}>Sin miembros todavía</div>}
            {members.map(m => (
              <div key={m.id} className={s.memberRow}>
                <div className={s.memberAvatar}>{m.avatar || m.name.slice(0, 2).toUpperCase()}</div>
                <div className={s.memberInfo}>
                  <div className={s.memberName}>{m.name}</div>
                  <div className={s.memberEmail}>{m.email}</div>
                </div>
                <div className={s.memberMeta}>
                  <select className={s.roleSelect} value={m.roleId} onChange={e => updateMember(m.id, { roleId: e.target.value })}>
                    {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                  <span className={`${s.statusDot} ${m.status === 'active' ? s.dotGreen : s.dotRed}`} />
                </div>
                <button className={s.delMemberBtn} title="Quitar de esta cuenta" onClick={() => { if (confirm(`¿Quitar a ${m.name || m.email} de esta cuenta?`)) { deleteMember(m.id); flash('Miembro eliminado') } }}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Roles ── */}
      {view === 'roles' && (
        <div className={s.section}>
          <div className={s.sectionHeader}>
            <div className={s.sectionTitle}>Roles y permisos</div>
            <button className={s.addBtn} onClick={() => setShowNewRole(!showNewRole)}>
              {showNewRole ? '✕ Cancelar' : '+ Nuevo rol'}
            </button>
          </div>

          {showNewRole && (
            <form className={s.formCard} onSubmit={handleAddRole}>
              <div className={s.field} style={{ maxWidth: 300 }}>
                <label>Nombre del rol</label>
                <input required placeholder="Ej: Supervisor, Operador..." value={nr.name} onChange={e => setNr(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div className={s.permGrid}>
                {ALL_PERMS.map(p => (
                  <label key={p.id} className={s.permRow}>
                    <input type="checkbox" checked={!!nr.permissions[p.id]} onChange={() => toggleNewPerm(p.id)} />
                    <div>
                      <div className={s.permLabel}>{p.label}</div>
                      <div className={s.permDesc}>{p.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
              <div className={s.formActions}>
                <button type="button" className={s.cancelBtn} onClick={() => setShowNewRole(false)}>Cancelar</button>
                <button type="submit" className={s.primaryBtn}>Crear rol</button>
              </div>
            </form>
          )}

          <div className={s.roleList}>
            {roles.map(role => (
              <div key={role.id} className={s.roleCard}>
                <div className={s.roleCardHeader}>
                  <div>
                    <span className={s.roleName}>{role.name}</span>
                    {role.isSystem && <span className={s.systemBadge}>Sistema</span>}
                  </div>
                  {!role.isSystem && (
                    <button className={s.delRoleBtn} onClick={() => { deleteRole(role.id); flash('Rol eliminado') }}>Eliminar</button>
                  )}
                </div>
                <div className={s.permGrid}>
                  {ALL_PERMS.map(p => {
                    const has = !!role.permissions?.[p.id]
                    return (
                      <label key={p.id} className={`${s.permRow} ${role.isSystem ? s.permReadonly : ''}`}>
                        <input type="checkbox" checked={has} disabled={role.isSystem} onChange={() => togglePerm(role.id, p.id)} />
                        <div>
                          <div className={s.permLabel}>{p.label}</div>
                          <div className={s.permDesc}>{p.desc}</div>
                        </div>
                      </label>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Invites ── */}
      {view === 'invites' && (
        <div className={s.section}>
          <div className={s.sectionHeader}>
            <div className={s.sectionTitle}>Invitaciones por enlace único</div>
          </div>

          {/* Generate invite link */}
          <div className={s.inviteForm}>
            <div className={s.inviteFormTitle}>Generar enlace de invitación</div>
            <div className={s.inviteFormRow}>
              <div className={s.field}>
                <label>Rol</label>
                <select value={inviteRoleId} onChange={e => setInviteRoleId(e.target.value)}>
                  <option value="">Selecciona un rol...</option>
                  {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              {selectedAgent && (
                <div className={s.field}>
                  <label>Cuenta IA</label>
                  <div className={s.agentFixed}>{selectedAgent.name}</div>
                </div>
              )}
              <button className={s.primaryBtn} style={{ alignSelf: 'flex-end' }} onClick={handleGenerateInvite}>
                Generar enlace
              </button>
            </div>
            {generatedLink && (
              <div className={s.generatedLink}>
                <div className={s.generatedLinkLabel}>Enlace generado (uso único):</div>
                <div className={s.generatedLinkRow}>
                  <input className={s.linkInput} readOnly value={generatedLink} onFocus={e => e.target.select()} />
                  <button className={s.copyBtn} onClick={() => { navigator.clipboard.writeText(generatedLink); flash('Copiado ✓') }}>Copiar</button>
                </div>
                <div className={s.linkHint}>Comparte este enlace con el invitado. Solo funciona una vez.</div>
              </div>
            )}
          </div>

          {/* Pending invites */}
          <div className={s.inviteList}>
            <div className={s.inviteListTitle}>Invitaciones pendientes ({invites.filter(i => !i.usedAt).length})</div>
            {invites.filter(i => !i.usedAt).length === 0 && <div className={s.empty}>Sin invitaciones pendientes</div>}
            {invites.filter(i => !i.usedAt).map(inv => {
              const role = roles.find(r => r.id === inv.roleId)
              const agent = visibleAgents.find(a => a.id === inv.agentId)
              return (
                <div key={inv.id} className={s.inviteRow}>
                  <div className={s.inviteInfo}>
                    <div className={s.inviteRole}>{role?.name || 'Rol desconocido'}{agent && ` · ${agent.name}`}</div>
                    <div className={s.inviteMeta}>Creado por {inv.createdBy || 'N/A'} · {new Date(inv.createdAt).toLocaleDateString('es')}</div>
                  </div>
                  <button className={s.revokeBtn} onClick={() => handleRevokeInvite(inv.token)}>Revocar</button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
