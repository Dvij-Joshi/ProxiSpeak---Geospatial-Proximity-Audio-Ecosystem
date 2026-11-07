import mongoose from 'mongoose';

const OfficeLayoutSchema = new mongoose.Schema({
  layoutId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true,
  },
  orgId: {
    type: String,
    required: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    default: '',
  },
  theme: {
    type: String,
    default: 'custom',
  },
  width: {
    type: Number,
    default: 2200,
  },
  height: {
    type: Number,
    default: 1300,
  },
  spawnPoint: {
    x: { type: Number, default: 1100 },
    y: { type: Number, default: 720 },
  },
  walls: [
    {
      x: Number,
      y: Number,
      w: Number,
      h: Number,
      _id: false,
    },
  ],
  doors: [
    {
      key: String,
      name: String,
      x: Number,
      y: Number,
      w: Number,
      h: Number,
      arc: [Number],
      isIsolated: { type: Boolean, default: true },
      _id: false,
    },
  ],
  furniture: [
    {
      type: { type: String, default: 'rect' },
      x: Number,
      y: Number,
      w: Number,
      h: Number,
      color: String,
      rx: Number,
      r: Number,
      _id: false,
    },
  ],
  soundZones: [
    {
      id: String,
      name: String,
      bounds: {
        x1: Number,
        y1: Number,
        x2: Number,
        y2: Number,
      },
      isIsolated: { type: Boolean, default: false },
      isStage: { type: Boolean, default: false },
      maxDistance: { type: Number, default: 100 },
      _id: false,
    },
  ],
  createdBy: {
    type: String,
    default: 'Anonymous',
  },
  isDefault: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model('OfficeLayout', OfficeLayoutSchema);
