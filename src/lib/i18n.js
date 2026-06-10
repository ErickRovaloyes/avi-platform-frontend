// Internacionalización de la plataforma.
// Español por defecto. Los 10 idiomas aparecen en el selector; ES/EN están
// traducidos y el resto cae a español hasta que se completen.

export const LANGUAGES = [
  { code: 'es', label: 'Español',         native: 'Español' },
  { code: 'en', label: 'Inglés',          native: 'English' },
  { code: 'zh', label: 'Chino mandarín',  native: '中文' },
  { code: 'hi', label: 'Hindi',           native: 'हिन्दी' },
  { code: 'fr', label: 'Francés',         native: 'Français' },
  { code: 'ar', label: 'Árabe',           native: 'العربية', rtl: true },
  { code: 'ja', label: 'Japonés',         native: '日本語' },
  { code: 'pt', label: 'Portugués',       native: 'Português' },
  { code: 'ru', label: 'Ruso',            native: 'Русский' },
  { code: 'ur', label: 'Urdu',            native: 'اردو', rtl: true },
]

const KEY = 'avi_lang'

// Diccionarios. La base es 'es'; 'en' está traducido. Otros idiomas heredan 'es'.
const dict = {
  es: {
    'nav.inbox': 'Inbox', 'nav.crm': 'CRM', 'nav.flows': 'Flujos',
    'nav.zonaIA': 'Zona IA', 'nav.config': 'Configuración', 'nav.metricas': 'Métricas',
    'nav.teamchat': 'Chat de equipo', 'nav.support': 'Soporte',
    'common.save': 'Guardar', 'common.cancel': 'Cancelar', 'common.delete': 'Eliminar',
    'common.edit': 'Editar', 'common.send': 'Enviar', 'common.close': 'Cerrar',
    'common.search': 'Buscar', 'common.loading': 'Cargando…', 'common.create': 'Crear',
    'profile.title': 'Mi perfil', 'profile.theme': 'Tema de la plataforma',
    'profile.language': 'Idioma de la plataforma', 'profile.accounts': 'Cuentas IA a las que perteneces',
    'profile.changePhoto': 'Cambiar foto', 'profile.member': 'Miembro', 'profile.noAccounts': 'Sin cuentas asignadas.',
    'auth.logout': 'Cerrar sesión',
    'theme.actual': 'Actual', 'theme.claro': 'Claro', 'theme.oscuro': 'Oscuro', 'theme.gris': 'Gris',
  },
  en: {
    'nav.inbox': 'Inbox', 'nav.crm': 'CRM', 'nav.flows': 'Flows',
    'nav.zonaIA': 'AI Zone', 'nav.config': 'Settings', 'nav.metricas': 'Metrics',
    'nav.teamchat': 'Team chat', 'nav.support': 'Support',
    'common.save': 'Save', 'common.cancel': 'Cancel', 'common.delete': 'Delete',
    'common.edit': 'Edit', 'common.send': 'Send', 'common.close': 'Close',
    'common.search': 'Search', 'common.loading': 'Loading…', 'common.create': 'Create',
    'profile.title': 'My profile', 'profile.theme': 'Platform theme',
    'profile.language': 'Platform language', 'profile.accounts': 'AI accounts you belong to',
    'profile.changePhoto': 'Change photo', 'profile.member': 'Member', 'profile.noAccounts': 'No accounts assigned.',
    'auth.logout': 'Log out',
    'theme.actual': 'Default', 'theme.claro': 'Light', 'theme.oscuro': 'Dark', 'theme.gris': 'Gray',
  },
}

export function getLang() {
  try { return localStorage.getItem(KEY) || 'es' } catch { return 'es' }
}

export function applyLangDir(code) {
  const l = LANGUAGES.find(x => x.code === (code || getLang()))
  document.documentElement.dir = l?.rtl ? 'rtl' : 'ltr'
  document.documentElement.lang = l?.code || 'es'
}

export function setLangStored(code) {
  try { localStorage.setItem(KEY, code) } catch {}
  applyLangDir(code)
}

export function translate(key, lang) {
  const l = lang || getLang()
  return dict[l]?.[key] ?? dict.es[key] ?? key
}
