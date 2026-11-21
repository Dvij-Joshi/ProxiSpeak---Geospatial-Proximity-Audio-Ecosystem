// Keep synthesized interface sounds independent of meeting playback and microphone capture.
let effectsContext;
const cues = {
  click:[530,430,.045], open:[250,520,.16], close:[320,110,.13],
  sit:[210,130,.10], stand:[130,240,.11], hand:[460,720,.13], lower:[600,390,.09],
  join:[400,660,.18], leave:[500,280,.15], throw:[300,950,.13], impact:[180,60,.12],
  warning:[740,520,.22], removed:[420,80,.36], knock:[230,82,.09],
  mute:[480,280,.14], unmute:[320,640,.14], deafen:[300,150,.18],
  undeafen:[440,660,.18], 'peer-enter':[660,880,.14],
};
export function playUiChime(type) {
  try {
    if (localStorage.getItem('meeting-sfx') === 'off') return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = effectsContext || (effectsContext = new AudioContext());
    if (ctx.state !== 'running') {
      if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
      ctx.resume().catch(() => {});
    }
    const [start,end,duration] = cues[type];
    const osc = ctx.createOscillator(), gain = ctx.createGain(), t = ctx.currentTime;
    osc.type = ['impact','sit','close','knock'].includes(type) ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(start,t);
    osc.frequency.exponentialRampToValueAtTime(end,t+duration);
    gain.gain.setValueAtTime(.001,t);
    gain.gain.exponentialRampToValueAtTime(.07,t+.009);
    gain.gain.exponentialRampToValueAtTime(.001,t+duration);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    osc.start(t); osc.stop(t+duration);
  } catch {}
}
export function playKnockSound() { playUiChime('knock'); }
