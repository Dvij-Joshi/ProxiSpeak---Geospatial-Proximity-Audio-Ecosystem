// TODO Week 1: Render avatar circle + username label on canvas
// Props: { ctx, x, y, color, username, isLocal }
function Avatar({ ctx, x, y, color = '#4A90D9', username = '', isLocal = false }) {
  if (!ctx) return null;

  // Draw avatar circle
  ctx.beginPath();
  ctx.arc(x, y, 20, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = isLocal ? '#ffffff' : '#aaaaaa';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Draw username label
  ctx.fillStyle = '#ffffff';
  ctx.font = '12px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(username, x, y + 35);

  return null; // Canvas-drawn — no DOM element
}

export default Avatar;
