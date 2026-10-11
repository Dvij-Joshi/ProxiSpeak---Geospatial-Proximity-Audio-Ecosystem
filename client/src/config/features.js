/**
 * Feature flags for ProxiSpeak.
 * Tentative features discussed in team session — toggled here during development.
 * Set to `true` once the feature is implemented and ready for testing.
 */
export const FEATURES = {
  // Week 2
  NETWORK_QUALITY_INDICATOR: false, // Show 📶 icon above avatars with poor WebRTC stats

  // Week 3
  LOCKED_ROOMS: false,              // Room locking + knock-to-enter system
  HELP_BEACON: false,               // Contextual help beacon with skill matching

  // Week 4
  CHAT_BUBBLES: false,              // Real-time speech-to-text subtitles above avatars
  SPATIAL_PINS: false,              // Sticky knowledge pins anchored to map locations
  FIND_COLLEAGUE: false,            // Search + navigate to a teammate's avatar

  // Post-MVP (AI)
  LIVE_TRANSLATION: false,          // Translate captions via external API
  CONVERSATION_HANDOFF: false,      // AI-generated recap for late-joining participants
};

/**
 * Proximity and audio constants.
 */
export const PROXIMITY = {
  MAX_EARSHOT_DISTANCE: 100,        // pixels — max range for WebRTC connection
  LOCK_ZONE_AUDIO_BLEED: 0,         // gain multiplier for locked room audio leakage (0 = none)
  NETWORK_CHECK_INTERVAL_MS: 3000,  // how often to check WebRTC connection stats
};

/**
 * Canvas / world constants.
 */
export const WORLD = {
  WIDTH: 1280,
  HEIGHT: 720,
  TARGET_FPS: 60,
  AVATAR_RADIUS: 20,
  MOVE_EMIT_THROTTLE_MS: 50,        // min ms between move Socket.io emissions
};
