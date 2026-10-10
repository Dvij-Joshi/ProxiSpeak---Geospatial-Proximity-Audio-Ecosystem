import mongoose from 'mongoose';

/**
 * User schema with GeoJSON Point for geospatial proximity queries.
 * The `location` field uses a 2dsphere index for MongoDB $near / $geoWithin queries.
 */
const userSchema = new mongoose.Schema(
  {
    socketId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    username: {
      type: String,
      required: true,
      trim: true,
      maxlength: 30,
    },
    avatarColor: {
      type: String,
      default: '#4A90D9',
      match: /^#[0-9A-Fa-f]{6}$/,
    },
    roomId: {
      type: String,
      required: true,
      index: true,
    },
    /**
     * GeoJSON Point storing the user's canvas X/Y position.
     * coordinates: [x, y] — canvas units (0–1920, 0–1080)
     */
    location: {
      type: {
        type: String,
        enum: ['Point'],
        required: true,
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        required: true,
        default: [960, 540], // Center of the default 1920x1080 canvas
      },
    },
    lastSeen: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// 2dsphere index — required for $near and $geoWithin geospatial queries
userSchema.index({ location: '2dsphere' });

const User = mongoose.model('User', userSchema);
export default User;
