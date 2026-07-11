import { useSearchParams } from 'react-router-dom'

// Página pública a la que vuelve el cliente tras pagar en la pasarela. La
// confirmación real (reserva/pedido) la hace el webhook del proveedor; aquí solo
// tranquilizamos al cliente. No expone datos sensibles.
export default function PayReturn() {
  const [params] = useSearchParams()
  const ref = params.get('ref') || ''
  const page = { minHeight: '100vh', background: '#0d0d12', color: '#ebebf0', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'system-ui, sans-serif' }
  const card = { width: '100%', maxWidth: 460, background: '#16161d', border: '1px solid #2a2a35', borderRadius: 16, padding: 34, textAlign: 'center' }
  return (
    <div style={page}>
      <div style={card}>
        <div style={{ fontSize: 54 }}>✅</div>
        <h2 style={{ marginTop: 10 }}>¡Gracias por tu pago!</h2>
        <p style={{ color: '#a8a8b8', fontSize: 14, lineHeight: 1.5, marginTop: 10 }}>
          Estamos confirmando tu pago. En cuanto se acredite, recibirás la confirmación de tu reserva
          por WhatsApp o correo. Puedes cerrar esta ventana.
        </p>
        {ref && <p style={{ color: '#5a5a66', fontSize: 11, marginTop: 16 }}>Referencia: {ref}</p>}
        <div style={{ marginTop: 20, fontSize: 11, color: '#5a5a66' }}>Powered by AVI Platform</div>
      </div>
    </div>
  )
}
