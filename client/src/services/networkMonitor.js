/**
 * Polls WebRTC connection stats for a given RTCPeerConnection
 * and emits a network quality score back via Socket.io.
 *
 * Quality levels:
 *   'good'      — packet loss < 2%,  RTT < 150ms
 *   'degraded'  — packet loss < 8%,  RTT < 400ms
 *   'poor'      — packet loss >= 8% or RTT >= 400ms
 *
 * TODO Week 2: hook this into webrtcManager.js for each active peer connection
 */

const POLL_INTERVAL_MS = 3000;
const timers = new Map(); // peerId → intervalId

/**
 * Starts polling WebRTC stats for a peer and emitting quality events.
 * @param {RTCPeerConnection} pc
 * @param {string} peerId — remote socket ID
 * @param {import('socket.io-client').Socket} socket
 */
export function startNetworkMonitor(pc, peerId, socket) {
  if (timers.has(peerId)) return; // already monitoring

  const id = setInterval(async () => {
    try {
      const stats = await pc.getStats();
      let packetLoss = 0;
      let rtt = 0;

      stats.forEach((report) => {
        if (report.type === 'remote-inbound-rtp' && report.kind === 'audio') {
          const sent = report.totalPacketsSent || 1;
          packetLoss = (report.packetsLost / sent) * 100;
          rtt = (report.roundTripTime || 0) * 1000; // convert to ms
        }
      });

      const quality =
        packetLoss >= 8 || rtt >= 400 ? 'poor'
        : packetLoss >= 2 || rtt >= 150 ? 'degraded'
        : 'good';

      socket.emit('network-quality', { peerId, quality, packetLoss, rtt });
    } catch {
      // peer connection may have closed
      stopNetworkMonitor(peerId);
    }
  }, POLL_INTERVAL_MS);

  timers.set(peerId, id);
}

/**
 * Stops polling stats for a peer (call when peer connection closes).
 * @param {string} peerId
 */
export function stopNetworkMonitor(peerId) {
  clearInterval(timers.get(peerId));
  timers.delete(peerId);
}
