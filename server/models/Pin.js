import mongoose from 'mongoose';

/**
 * Pin schema — Spatial Knowledge Pins feature.
 * Sticky notes anchored to specific canvas coordinates, visible to all room members.
 * TODO Week 4: implement full CRUD endpoints and real-time pin sync via Socket.io
 */
const pinSchema = new mongoose.Schema(
  {
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    roomId:    { type: String, required: true, index: true },
    type: {
      type: String,
      enum: ['bug-report', 'task', 'update', 'question', 'announcement'],
      default: 'update',
    },
    content:  { type: String, required: true, maxlength: 500 },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true }, // [x, y]
    },
    resolved: { type: Boolean, default: false },
  },
  { timestamps: true }
);

pinSchema.index({ location: '2dsphere' });

export default mongoose.model('Pin', pinSchema);
