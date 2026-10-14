import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  socketId: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  avatarColor: { type: String, default: '#3b82f6' },
  roomId: { type: String, default: 'main-office' },
  x: { type: Number, default: 620 },
  y: { type: Number, default: 390 },

  // Flat 2D coordinates [x, y] on the 1200x680 canvas
  location: {
    type: [Number],
    default: [620, 390],
  },

  lastSeen: { type: Date, default: Date.now },
});

// Planar 2D index bounded for 0 to 2000 pixels (canvas dimensions)
UserSchema.index({ location: '2d' }, { min: 0, max: 2000 });
UserSchema.index({ roomId: 1, lastSeen: 1 });

export default mongoose.model('User', UserSchema);
