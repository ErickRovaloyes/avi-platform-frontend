// Exportación de reportes: Excel (CSV con BOM, lo abre Excel nativo) y PDF
// (ventana imprimible → "Guardar como PDF"). Sin dependencias externas.

const cell = (c, r) => (typeof c.value === 'function' ? c.value(r) : r[c.key])
function csvEsc(v) { const s = v == null ? '' : String(v); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }
function htmlEsc(v) { return String(v == null ? '' : v).replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m])) }

export function downloadCSV(filename, columns, rows) {
  const head = columns.map(c => csvEsc(c.label)).join(',')
  const body = rows.map(r => columns.map(c => csvEsc(cell(c, r))).join(',')).join('\n')
  const csv = '﻿' + head + '\n' + body // BOM → Excel detecta UTF-8
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename.endsWith('.csv') ? filename : filename + '.csv'
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
}

export function printReport(title, columns, rows, subtitle = '') {
  const head = columns.map(c => `<th>${htmlEsc(c.label)}</th>`).join('')
  const body = rows.map(r => '<tr>' + columns.map(c => `<td>${htmlEsc(cell(c, r))}</td>`).join('') + '</tr>').join('')
  const w = window.open('', '_blank', 'width=1000,height=700')
  if (!w) { alert('Permite las ventanas emergentes para exportar a PDF.'); return }
  // La ventana se abre en blanco: NO hereda el CSS de la app, así que las tipografías de
  // marca hay que declararlas aquí. Van con URL absoluta porque en un documento about:blank
  // las relativas no resuelven de forma fiable en todos los navegadores.
  const o = window.location.origin
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${htmlEsc(title)}</title>
    <style>
      @font-face{font-family:'Neubau Pro';src:url('${o}/fonts/NeubauPro-Bold.woff2') format('woff2');font-weight:400 900;font-display:block;}
      @font-face{font-family:'Helvetica Now Display';src:url('${o}/fonts/HelveticaNowDisplay-Light.woff2') format('woff2');font-weight:300 500;font-display:block;}
      @font-face{font-family:'Helvetica Now Display';src:url('${o}/fonts/HelveticaNowDisplay-Bold.woff2') format('woff2');font-weight:600 900;font-display:block;}
      *{font-family:'Helvetica Now Display','Helvetica Neue',Helvetica,Arial,sans-serif;}
      body{margin:28px;color:#111;}
      h1{font-family:'Neubau Pro','Helvetica Now Display',Arial,sans-serif;font-size:18px;margin:0 0 2px;letter-spacing:-0.015em;}
      td{font-variant-numeric:tabular-nums;}
      .sub{color:#666;font-size:12px;margin-bottom:14px;}
      table{width:100%;border-collapse:collapse;font-size:11.5px;}
      th,td{border:1px solid #ccc;padding:5px 8px;text-align:left;}
      th{background:#f1f1f4;}
      tr:nth-child(even) td{background:#fafafa;}
      @media print{.noprint{display:none;}}
    </style></head><body>
    <h1>${htmlEsc(title)}</h1>
    <div class="sub">AVI Asistente · ${new Date().toLocaleString('es')}${subtitle ? ' · ' + htmlEsc(subtitle) : ''} · ${rows.length} fila(s)</div>
    <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
    <script>
      // Esperar a que las tipografías estén listas: si se imprime antes, el PDF sale con la
      // fuente de reserva. El temporizador es el plan B por si fonts.ready no resuelve.
      var go=function(){if(!window.__p){window.__p=1;window.print()}}
      if(document.fonts&&document.fonts.ready){document.fonts.ready.then(function(){setTimeout(go,60)})}
      setTimeout(go,2500)
    <\/script>
    </body></html>`)
  w.document.close(); w.focus()
}
