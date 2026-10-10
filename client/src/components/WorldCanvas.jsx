import { useRef, useEffect } from 'react';

// TODO Week 1: Implement full canvas rendering loop at 60 FPS
function WorldCanvas({ username }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // Placeholder — draw a basic grid
    ctx.fillStyle = '#1a1f2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#2a3040';
    for (let x = 0; x < canvas.width; x += 50) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 50) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={1280}
      height={720}
      style={{ display: 'block', margin: 'auto' }}
    />
  );
}

export default WorldCanvas;
