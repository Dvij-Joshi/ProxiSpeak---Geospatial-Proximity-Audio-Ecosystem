import { useEffect, useRef, useState } from 'react';
import { WORLD } from '../config/features.js';

/**
 * Custom hook to handle keyboard movement (WASD / Arrow keys).
 * Manages player position, movement velocity, and canvas boundary collision.
 *
 * @param {Function} onMove - Callback fired when position changes (throttled)
 * @param {Object} initialPos - Starting {x, y} coordinates
 * @returns {{ x: number, y: number }} current position
 */
export function useMovement(onMove, initialPos = { x: 640, y: 360 }) {
  const [position, setPosition] = useState(initialPos);
  const positionRef = useRef(initialPos);
  const keysPressed = useRef({});
  const lastEmitTime = useRef(0);
  const speed = 4; // pixels per frame

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      keysPressed.current[e.key.toLowerCase()] = true;
    };

    const handleKeyUp = (e) => {
      keysPressed.current[e.key.toLowerCase()] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    let animationFrameId;

    const gameLoop = () => {
      let dx = 0;
      let dy = 0;

      const keys = keysPressed.current;
      if (keys['w'] || keys['arrowup']) dy -= speed;
      if (keys['s'] || keys['arrowdown']) dy += speed;
      if (keys['a'] || keys['arrowleft']) dx -= speed;
      if (keys['d'] || keys['arrowright']) dx += speed;

      // Diagonal movement normalization
      if (dx !== 0 && dy !== 0) {
        dx *= 0.7071;
        dy *= 0.7071;
      }

      if (dx !== 0 || dy !== 0) {
        const radius = WORLD.AVATAR_RADIUS || 20;
        const newX = Math.max(radius, Math.min(WORLD.WIDTH - radius, positionRef.current.x + dx));
        const newY = Math.max(radius, Math.min(WORLD.HEIGHT - radius, positionRef.current.y + dy));

        if (newX !== positionRef.current.x || newY !== positionRef.current.y) {
          const nextPos = { x: Math.round(newX), y: Math.round(newY) };
          setPosition(nextPos);
          positionRef.current = nextPos;

          const now = Date.now();
          if (onMove && now - lastEmitTime.current >= WORLD.MOVE_EMIT_THROTTLE_MS) {
            onMove(nextPos);
            lastEmitTime.current = now;
          }
        }
      }

      animationFrameId = requestAnimationFrame(gameLoop);
    };

    animationFrameId = requestAnimationFrame(gameLoop);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      cancelAnimationFrame(animationFrameId);
    };
  }, [onMove]);

  return position;
}
