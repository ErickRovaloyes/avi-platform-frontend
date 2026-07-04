/**
 * SelectionFx — capas animadas para el item SELECCIONADO (solo tema AVI Glass).
 * Nodo de la nebulosa interna (z2); las bandas de luz del marco (nítida z4 +
 * humo z1) son ::after/::before del propio item (ver index.css). Fuera de AVI
 * Glass queda oculto (display:none) y no afecta a los demás temas.
 * El estilo vive en index.css bajo [data-theme="aviglass"].
 */
export default function SelectionFx() {
  return <i className="aviselNebula" aria-hidden="true" />
}
