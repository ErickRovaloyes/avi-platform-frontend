// Sonido de notificación sintetizado con WebAudio (sin assets → seguro con CSP).
// Un chime corto de dos tonos ascendentes. Reutiliza un solo AudioContext.
let _ac = null
function ctx() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    if (!_ac) _ac = new AC()
    if (_ac.state === 'suspended') _ac.resume().catch(() => {})
    return _ac
  } catch { return null }
}

export function playNotifSound() {
  const ac = ctx()
  if (!ac) return
  try {
    const now = ac.currentTime
    const tone = (freq, start, dur) => {
      const o = ac.createOscillator(), g = ac.createGain()
      o.type = 'sine'; o.frequency.value = freq
      o.connect(g); g.connect(ac.destination)
      g.gain.setValueAtTime(0.0001, now + start)
      g.gain.exponentialRampToValueAtTime(0.22, now + start + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, now + start + dur)
      o.start(now + start); o.stop(now + start + dur + 0.02)
    }
    tone(660, 0, 0.14)     // mi
    tone(880, 0.11, 0.18)  // la (más agudo, "ta-da")
  } catch {}
}
