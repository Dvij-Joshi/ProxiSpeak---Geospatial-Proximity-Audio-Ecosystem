import { useEffect, useRef } from 'react';
import { drawModel } from '../world/models';
import { drawCharacter } from '../world/character';

// Lobby vignettes reuse the furniture and characters on the playable floor.
const rooms = {
  office: [
    ['plant', 42, 52, 30, 30, '#399c92'],
    ['desk', 106, 58, 112, 49, '#e1ad72'],
    ['chair', 138, 124, 28, 27, '#e47b57'],
    ['desk', 260, 44, 109, 44, '#e1ad72'],
    ['plant', 386, 96, 30, 30, '#399c92'],
    ['sofa', 284, 180, 104, 39, '#399c92'],
  ],
  conference: [
    ['screen', 144, 23, 132, 22, '#399c92'],
    ['plant', 50, 55, 32, 32, '#399c92'],
    ['desk', 307, 52, 67, 38, '#e1ad72'],
    ...[108, 162].flatMap(y => [72, 119, 166, 268, 315, 362].map(x => ['chair', x, y, 29, 29, '#e47b57'])),
  ],
  lounge: [
    ['plant', 70, 54, 35, 35, '#399c92'],
    ['sofa', 143, 54, 103, 36, '#e47b57'],
    ['plant', 350, 90, 32, 32, '#399c92'],
    ['table', 148, 125, 75, 38, '#c49362'],
    ['sofa', 74, 178, 112, 38, '#399c92'],
    ['plant', 301, 178, 30, 30, '#399c92'],
  ],
};

export function WorkspaceArt({ theme = 'office' }) {
  const ref = useRef(null);
  useEffect(() => {
    const ctx = ref.current.getContext('2d');
    const models = rooms[theme === 'rooftop' ? 'lounge' : theme] || rooms.office;
    ctx.save();
    ctx.scale(2, 2);
    ctx.fillStyle = theme === 'conference' ? '#c4b4a0' : theme === 'lounge' ? '#a5cbb3' : '#b7c8b7';
    ctx.fillRect(0, 0, 440, 250);
    ctx.strokeStyle = 'rgba(32,51,52,0.16)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let x = 0; x < 440; x += 24) { ctx.moveTo(x, 0); ctx.lineTo(x, 250); }
    for (let y = 0; y < 250; y += 24) { ctx.moveTo(0, y); ctx.lineTo(440, y); }
    ctx.stroke();
    for (const [kind, x, y, w, h, color] of models) {
      drawModel(ctx, { kind, x, y, w, h, color });
    }
    drawCharacter(ctx, 232, 169, '#eed46d');
    drawCharacter(ctx, 254, 196, '#e47b57', { facing: -1 });
    ctx.restore();
  }, [theme]);
  return <canvas ref={ref} width={880} height={500} className="workspace-art" aria-hidden="true" />;
}

export function AvatarPortrait({ color = '#399c92', name = '', transparent=false }) {
  const ref = useRef(null);
  useEffect(() => {
    const ctx = ref.current.getContext('2d');
    ctx.save();
    ctx.fillStyle = '#efe5ce';
    if (transparent) ctx.clearRect(0,0,72,72);
    else ctx.fillRect(0, 0, 72, 72);
    ctx.scale(1.7, 1.7);
    drawCharacter(ctx, 21, 46, color);
    ctx.restore();
  }, [color,transparent]);
  return <canvas ref={ref} width={72} height={72} className="avatar-portrait" role="img" aria-label={name ? name + ' avatar' : 'Avatar'} />;
}
