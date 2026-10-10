// TODO Week 2: Implement full WebRTC peer connection lifecycle
// Manages RTCPeerConnection instances keyed by remote socketId

const peers = new Map(); // socketId → RTCPeerConnection
let localStream = null;

export async function initLocalStream() {
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  return localStream;
}

export function createPeer(socketId, socket) {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  });

  localStream?.getTracks().forEach((track) => pc.addTrack(track, localStream));

  pc.onicecandidate = ({ candidate }) => {
    if (candidate) socket.emit('ice-candidate', { to: socketId, candidate });
  };

  // TODO: handle pc.ontrack → pass stream to audioMixer

  peers.set(socketId, pc);
  return pc;
}

export function closePeer(socketId) {
  peers.get(socketId)?.close();
  peers.delete(socketId);
}

export function getPeer(socketId) {
  return peers.get(socketId);
}
