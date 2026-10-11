import mongoose from 'mongoose';

/**
 * Beacon schema — Contextual Help Beacon feature.
 * A user broadcasts a help request (with a topic) visible to nearby colleagues.
 * TODO Week 3: implement full beacon lifecycle (create, resolve, cancel, expire)
 */
const beaconSchema = new mongoose.Schema(
  {
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    socketId:  { type: String, required: true },
    roomId:    { type: String, required: true },
    topic: {
      type: String,
      enum: ['debugging', 'design-review', 'code-question', 'other'],
      required: true,
    },
    description: { type: String, maxlength: 200 },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true }, // [x, y]
    },
    resolved: { type: Boolean, default: false },
  },
  { timestamps: true }
);

beaconSchema.index({ location: '2dsphere' });
beaconSchema.index({ roomId: 1, resolved: 1 });

export default mongoose.model('Beacon', beaconSchema);
