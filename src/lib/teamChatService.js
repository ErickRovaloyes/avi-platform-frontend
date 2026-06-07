import { getSocket, connectSocket, getToken } from './api.js'

// Lightweight socket relay for team chat. The panel owns the message/channel
// state; this module just guarantees a connected socket and fans out the two
// real-time events to subscribers.

let _bound     = false
let _msgSubs   = []
let _chanSubs  = []
let _onMessage = null
let _onChannels = null

function ensureBound() {
  const sock = getSocket()
  // Make sure the socket is actually connected — without this, listeners are
  // attached but no events ever arrive (the root cause of "no real-time").
  if (!sock.connected && getToken()) connectSocket(getToken())
  if (_bound) return
  _onMessage  = (payload) => { _msgSubs.forEach(cb => cb(payload)) }
  _onChannels = (payload) => { _chanSubs.forEach(cb => cb(payload)) }
  sock.on('teamchat:message',  _onMessage)
  sock.on('teamchat:channels', _onChannels)
  _bound = true
}

export function subscribeTeamMessages(cb) {
  ensureBound()
  _msgSubs.push(cb)
  return () => { _msgSubs = _msgSubs.filter(x => x !== cb) }
}

export function subscribeTeamChannels(cb) {
  ensureBound()
  _chanSubs.push(cb)
  return () => { _chanSubs = _chanSubs.filter(x => x !== cb) }
}
