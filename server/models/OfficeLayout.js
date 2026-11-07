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
      rotation: { type: Number, default: 0 },
      variation: { type: String, default: 'concrete_stud' },
      color: { type: String, default: '#2c3050' },
      thickness: { type: Number, default: 8 },
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
      rotation: { type: Number, default: 0 },
      variation: { type: String, default: 'single_swing' },
      color: { type: String, default: '#78350f' },
      arc: [Number],
      isIsolated: { type: Boolean, default: true },
      _id: false,
    },
  ],
  furniture: [
    {
      type: { type: String, default: 'rect' },
      furnitureType: String,
      variation: String,
      seats: Number,
      name: String,
      x: Number,
      y: Number,
      w: Number,
      h: Number,
      color: String,
      rx: Number,
      r: Number,
      rotation: { type: Number, default: 0 },
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
      variation: { type: String, default: 'meeting_suite' },
      color: { type: String, default: '#0284c7' },
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
