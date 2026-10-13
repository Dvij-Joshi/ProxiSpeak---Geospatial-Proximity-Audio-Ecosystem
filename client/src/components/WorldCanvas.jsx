import { useRef, useEffect } from 'react';
import { useMovement } from '../hooks/useMovement';
import { WORLD, PROXIMITY } from '../config/features';

function WorldCanvas({ username, onPositionChange, otherUsers = [] }) {
  const canvasRef = useRef(null);
  const position = useMovement(onPositionChange, { x: 640, y: 360 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // 1. Clear & draw background grid
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // 2. Draw 100px proximity earshot radius around local player
    ctx.beginPath();
    ctx.arc(position.x, position.y, PROXIMITY.MAX_EARSHOT_DISTANCE, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(59, 130, 246, 0.08)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]); // reset dash

    // 3. Draw other users
    otherUsers.forEach((user) => {
      ctx.beginPath();
      ctx.arc(user.x, user.y, WORLD.AVATAR_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = user.avatarColor || '#9ca3af';
      ctx.fill();
      ctx.strokeStyle = '#374151';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#e5e7eb';
      ctx.font = '12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(user.username || 'Peer', user.x, user.y + 32);
    });

    // 4. Draw local avatar
    ctx.beginPath();
    ctx.arc(position.x, position.y, WORLD.AVATAR_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = '#3b82f6';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Username label
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${username || 'You'} (You)`, position.x, position.y + 34);

  }, [position, username, otherUsers]);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', background: '#0b0f19' }}>
      <canvas
        ref={canvasRef}
        width={WORLD.WIDTH}
        height={WORLD.HEIGHT}
        style={{
          border: '1px solid #1f2937',
          borderRadius: '8px',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)',
        }}
      />
    </div>
  );
}

export default WorldCanvas;
