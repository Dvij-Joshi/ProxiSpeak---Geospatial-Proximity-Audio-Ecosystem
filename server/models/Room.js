import mongoose from 'mongoose';

const RoomSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  theme: {
    type: String,
    enum: ['office', 'conference', 'lounge'],
    default: 'office',
  },
  createdBy: {
    type: String,
    default: 'system',
  },
  isPublic: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model('Room', RoomSchema);
