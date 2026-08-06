import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './fonts.css'   // antes que index.css: las @font-face deben existir al aplicar --font
import './index.css'
import { applyTheme } from './lib/theme'
import { applyLangDir } from './lib/i18n'

// Si el almacén del navegador ya está lleno, se libera ANTES del primer render soltando las
// cachés de depuración de flujos. Son prescindibles y eran las que lo saturaban: un cap de
// 50 ejecuciones por flujo no limita bytes, y con una clave por cuenta+flujo se acumulaban
// megas. Con el almacén lleno, guardar el token fallaba y no se podía entrar a las cuentas.
// Esto recupera de golpe a quien ya arrastraba el problema, sin que tenga que borrar nada.
;(() => {
  try {
    localStorage.setItem('__avi_probe', 'x'.repeat(50000))
    localStorage.removeItem('__avi_probe')
  } catch {
    let freed = 0
    try {
      const keys = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && (k.startsWith('avi_flow_execs_') || k.startsWith('avi_flow_history_'))) keys.push(k)
      }
      for (const k of keys) { try { localStorage.removeItem(k); freed++ } catch {} }
    } catch {}
    if (freed) console.warn(`[storage] almacén lleno: liberadas ${freed} cachés de depuración de flujos.`)
  }
})()

applyTheme() // aplica el tema guardado antes del primer render
applyLangDir() // dirección/idioma del documento
ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>)
