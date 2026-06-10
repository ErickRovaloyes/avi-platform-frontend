import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { applyTheme } from './lib/theme'
import { applyLangDir } from './lib/i18n'

applyTheme() // aplica el tema guardado antes del primer render
applyLangDir() // dirección/idioma del documento
ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>)
