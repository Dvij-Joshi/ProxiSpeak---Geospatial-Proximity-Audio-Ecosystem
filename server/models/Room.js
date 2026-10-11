import mongoose from 'mongoose';

/**
 * Room schema — Locked Rooms + Knock system + office layout persistence.
 * TODO Week 3: implement lock/unlock events and knock request queue via Socket.io
 * TODO Week 4: implement furniture obstacle layout rendering
 */
const roomSchema = new mongoose.Schema(
  {
    roomId:      { type: String, required: true, unique: true },
    displayName: { type: String, default: 'Main Office' },
    isLocked:    { type: Boolean, default: false },
    lockedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    /** Queue of users waiting to enter a locked room */
    pendingKnocks: [
      {
        userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        socketId: String,
        username: String,
        knockedAt: { type: Date, default: Date.now },
      },
    ],

    /** Furniture / wall obstacles for the office layout */
    layout: [
      {
        type:   { type: String, enum: ['wall', 'desk', 'table', 'plant', 'zone'] },
        x:      Number,
        y:      Number,
        width:  Number,
        height: Number,
        label:  String,
        blockSound: { type: Boolean, default: false },
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model('Room', roomSchema);
