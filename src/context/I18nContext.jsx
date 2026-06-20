import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { getLang, setLangStored, translate, applyLangDir } from '../lib/i18n'
import { refreshUiLang } from '../lib/domI18n'

const Ctx = createContext(null)

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(() => getLang())

  const setLang = useCallback((code) => {
    setLangStored(code)
    setLangState(code)
  }, [])

  const t = useCallback((key) => translate(key, lang), [lang])

  // Asegura dirección/lang del documento al montar
  applyLangDir(lang)

  // Traducción de la interfaz en runtime: cuando el idioma es distinto de
  // español, recorre el DOM y traduce los textos de UI (deja intactos los
  // contenidos marcados con [data-i18n-skip]). Se re-aplica tras cada render.
  useEffect(() => {
    refreshUiLang(lang)
  }, [lang, children])

  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>
}

export function useI18n() {
  return useContext(Ctx) || { lang: 'es', setLang: () => {}, t: (k) => k }
}
