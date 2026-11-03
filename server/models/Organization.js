import mongoose from 'mongoose';

const MemberSchema = new mongoose.Schema(
  {
    username: { type: String, required: true },
    role: { type: String, enum: ['owner', 'admin', 'member'], default: 'member' },
    avatarColor: { type: String, default: '#3b82f6' },
    joinedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const OrganizationSchema = new mongoose.Schema({
  orgId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    index: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  slug: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
  },
  description: {
    type: String,
    default: '',
  },
  logoColor: {
    type: String,
    default: '#2563eb',
  },
  owner: {
    type: String,
    required: true,
  },
  members: [MemberSchema],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model('Organization', OrganizationSchema);
