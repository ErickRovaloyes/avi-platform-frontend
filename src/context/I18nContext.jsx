import { createContext, useContext, useState, useCallback } from 'react'
import { getLang, setLangStored, translate, applyLangDir } from '../lib/i18n'

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

  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>
}

export function useI18n() {
  return useContext(Ctx) || { lang: 'es', setLang: () => {}, t: (k) => k }
}
