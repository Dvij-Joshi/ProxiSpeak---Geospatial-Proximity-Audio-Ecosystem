import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  socketId: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  avatarColor: { type: String, default: '#3b82f6' },
  roomId: { type: String, default: 'main-office' },

  // GeoJSON Point — [lng, lat] maps to [x, y] canvas coords
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [620, 390] }, // [x, y]
  },

  lastSeen: { type: Date, default: Date.now },
});

// 2dsphere index for geospatial $near queries
UserSchema.index({ location: '2dsphere' });

export default mongoose.model('User', UserSchema);
