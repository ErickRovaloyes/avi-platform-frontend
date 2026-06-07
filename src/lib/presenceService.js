// Real-time advisor presence using BroadcastChannel API
// Shows how many other advisors are viewing the same conversation

const HEARTBEAT_MS = 10000
const EXPIRE_MS = 30000

let bc = null
let heartbeatTimer = null
let currentUserId = null
let currentUserName = null
let onChange = null
const presenceMap = new Map() // userId -> { userName, lastSeen }

export function startPresence(accId, agId, convId, userId, userName, onChangeCallback) {
  stopPresence()
  currentUserId = userId
  currentUserName = userName
  onChange = onChangeCallback

  bc = new BroadcastChannel(`avi_presence_${accId}_${agId}_${convId}`)

  bc.onmessage = ({ data }) => {
    if (data.userId === currentUserId) return
    if (data.type === 'leave') {
      presenceMap.delete(data.userId)
    } else {
      presenceMap.set(data.userId, { userName: data.userName, lastSeen: Date.now() })
    }
    notify()
  }

  bc.postMessage({ type: 'join', userId, userName })

  heartbeatTimer = setInterval(() => {
    const now = Date.now()
    for (const [uid, d] of presenceMap.entries()) {
      if (now - d.lastSeen > EXPIRE_MS) presenceMap.delete(uid)
    }
    bc.postMessage({ type: 'heartbeat', userId, userName })
    notify()
  }, HEARTBEAT_MS)

  notify()
}

export function stopPresence() {
  if (bc) {
    try { bc.postMessage({ type: 'leave', userId: currentUserId, userName: currentUserName }) } catch {}
    bc.close()
    bc = null
  }
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null }
  presenceMap.clear()
  onChange = null
}

function notify() {
  if (onChange) onChange([...presenceMap.values()])
}
