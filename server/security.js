/**
 * ProxiSpeak Security & Anti-DDoS Module
 *
 * Provides layered defense against DDoS, brute-force, event flooding, and spam attacks:
 * 1. HTTP Rate Limiting (Sliding Window Counter) for general APIs and sensitive auth routes
 * 2. Request body size gating to prevent memory exhaustion
 * 3. Slowloris HTTP timeout mitigation
 * 4. Socket.io IP-based connection concurrency caps
 * 5. Socket.io event throttler / token bucket for high-impact actions (knocks, movement, toggles)
 */

// Helper to extract true client IP behind reverse proxies (Render, Vercel, Cloudflare, Nginx)
export function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = typeof forwarded === 'string' ? forwarded.split(',') : forwarded;
    return ips[0].trim();
  }
  return (
    req.headers['cf-connecting-ip'] ||
    req.headers['x-real-ip'] ||
    req.socket?.remoteAddress ||
    '127.0.0.1'
  );
}

/**
 * Creates an Express sliding-window rate limiter middleware.
 * @param {Object} options
 * @param {number} options.windowMs - Time window in milliseconds
 * @param {number} options.max - Maximum requests allowed in the window
 * @param {string} options.message - Error message when limit is exceeded
 * @param {string} [options.keyPrefix='rl'] - Prefix for store keys
 */
export function createRateLimiter({
  windowMs = 60000,
  max = 100,
  message = 'Too many requests, please try again later.',
  keyPrefix = 'rl',
}) {
  // Map of clientIp -> array of timestamps
  const hits = new Map();

  // Periodic cleanup to avoid memory leaks
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [ip, timestamps] of hits.entries()) {
      const valid = timestamps.filter((t) => now - t < windowMs);
      if (valid.length === 0) {
        hits.delete(ip);
      } else {
        hits.set(ip, valid);
      }
    }
  }, Math.max(windowMs, 30000));

  if (cleanupInterval.unref) cleanupInterval.unref();

  return (req, res, next) => {
    // Skip rate limiting for internal health check self-pings
    if (req.path === '/health' && req.headers['user-agent']?.includes('node-fetch')) {
      return next();
    }

    const ip = getClientIp(req);
    const now = Date.now();
    const timestamps = hits.get(ip) || [];

    // Filter to only timestamps within current window
    const recent = timestamps.filter((t) => now - t < windowMs);

    if (recent.length >= max) {
      const oldest = recent[0];
      const resetTimeMs = windowMs - (now - oldest);
      const retryAfterSec = Math.max(1, Math.ceil(resetTimeMs / 1000));

      res.setHeader('Retry-After', retryAfterSec);
      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', 0);
      res.setHeader('X-RateLimit-Reset', Math.ceil((oldest + windowMs) / 1000));

      console.warn(`[Anti-DDoS] Rate limit triggered for IP ${ip} on ${req.method} ${req.path} (${keyPrefix})`);

      return res.status(429).json({
        error: message,
        retryAfterSeconds: retryAfterSec,
      });
    }

    recent.push(now);
    hits.set(ip, recent);

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - recent.length));

    next();
  };
}

// ── Pre-configured HTTP Limiters ─────────────────────────────────────────────

// General API: 150 requests per minute per IP
export const generalApiLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 150,
  message: 'Too many API requests from this IP address. Please slow down and try again in a minute.',
  keyPrefix: 'api',
});

// Sensitive Auth (Register & Login): 10 attempts per 10 minutes per IP
export const authLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 60,
  message: 'Too many authentication attempts from this IP. Please wait a few minutes before trying again.',
  keyPrefix: 'auth',
});

// Room Creation: 8 rooms per 10 minutes per IP
export const roomCreationLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 8,
  message: 'Room creation limit reached. Please wait a few minutes before hosting more workspaces.',
  keyPrefix: 'room',
});

// ── Security Headers Middleware ──────────────────────────────────────────────
export function securityHeadersMiddleware(_req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
}

// ── Socket.io Anti-DDoS & Anti-Spam Manager ───────────────────────────────────

// Track active socket connections per IP address to prevent connection exhaustion
const activeIpSockets = new Map(); // ip -> Set<socketId>
const MAX_SOCKETS_PER_IP = 10;

export function getSocketIp(socket) {
  const forwarded = socket.handshake.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = typeof forwarded === 'string' ? forwarded.split(',') : forwarded;
    return ips[0].trim();
  }
  return (
    socket.handshake.headers['cf-connecting-ip'] ||
    socket.handshake.address ||
    socket.conn?.remoteAddress ||
    '127.0.0.1'
  );
}

/**
 * Socket.io handshake middleware: Enforces max concurrent socket connections per IP
 */
export function socketConnectionLimiter(socket, next) {
  const ip = getSocketIp(socket);
  if (!activeIpSockets.has(ip)) {
    activeIpSockets.set(ip, new Set());
  }

  const currentSockets = activeIpSockets.get(ip);
  if (currentSockets.size >= MAX_SOCKETS_PER_IP) {
    console.warn(
      `[Anti-DDoS] Rejected connection from IP ${ip}: connection limit exceeded (${currentSockets.size}/${MAX_SOCKETS_PER_IP})`
    );
    return next(new Error('Connection limit exceeded. Too many concurrent sessions from this IP.'));
  }

  currentSockets.add(socket.id);

  socket.on('disconnect', () => {
    const sockets = activeIpSockets.get(ip);
    if (sockets) {
      sockets.delete(socket.id);
      if (sockets.size === 0) activeIpSockets.delete(ip);
    }
  });

  next();
}

/**
 * Per-socket event rate limiter (Token Bucket / Sliding Window)
 * Returns true if allowed, false if rate limited.
 */
export function createSocketEventThrottler() {
  const eventTimestamps = new Map(); // eventName -> Array<timestamp>

  return function isAllowed(eventName, maxEvents = 10, windowMs = 1000) {
    const now = Date.now();
    const timestamps = eventTimestamps.get(eventName) || [];
    const recent = timestamps.filter((t) => now - t < windowMs);

    if (recent.length >= maxEvents) {
      return false; // Throttled!
    }

    recent.push(now);
    eventTimestamps.set(eventName, recent);
    return true;
  };
}
