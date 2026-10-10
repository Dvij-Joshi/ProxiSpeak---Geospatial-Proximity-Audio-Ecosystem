// TODO Week 3: Implement dynamic gain + stereo panning via Web Audio API
// Audio graph per peer: MediaStreamSource → GainNode → StereoPannerNode → destination

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const peerNodes = new Map(); // socketId → { gainNode, pannerNode }

const MAX_DISTANCE = 100;

export function addPeerStream(socketId, stream) {
  const source = audioCtx.createMediaStreamSource(stream);
  const gainNode = audioCtx.createGain();
  const pannerNode = audioCtx.createStereoPanner();

  source.connect(gainNode).connect(pannerNode).connect(audioCtx.destination);
  peerNodes.set(socketId, { gainNode, pannerNode });
}

export function setGainAndPan(socketId, distance, deltaX) {
  const nodes = peerNodes.get(socketId);
  if (!nodes) return;

  // Volume drops linearly to 0 at MAX_DISTANCE
  nodes.gainNode.gain.value = Math.max(0, 1 - distance / MAX_DISTANCE);
  // Pan: -1 (full left) to +1 (full right)
  nodes.pannerNode.pan.value = Math.max(-1, Math.min(1, deltaX / MAX_DISTANCE));
}

export function removePeerStream(socketId) {
  peerNodes.delete(socketId);
}
