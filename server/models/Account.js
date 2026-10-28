import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const AccountSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 2,
    maxlength: 30,
  },
  usernameLower: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    index: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    index: true,
  },
  passwordHash: {
    type: String,
    required: true,
  },
  avatarColor: {
    type: String,
    default: '#3b82f6',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

AccountSchema.pre('validate', function () {
  if (this.username) {
    this.usernameLower = this.username.trim().toLowerCase();
  }
  if (this.email) {
    this.email = this.email.trim().toLowerCase();
  }
});

AccountSchema.methods.verifyPassword = async function (password) {
  return bcrypt.compare(password, this.passwordHash);
};

AccountSchema.statics.hashPassword = async function (password) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

// Case-insensitive credential search helper: matches username or email
AccountSchema.statics.findByCredentials = async function (identifier) {
  if (!identifier) return null;
  const clean = identifier.trim().toLowerCase();
  const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return this.findOne({
    $or: [
      { usernameLower: clean },
      { email: clean },
      { username: { $regex: new RegExp(`^${escaped}$`, 'i') } },
      { email: { $regex: new RegExp(`^${escaped}$`, 'i') } },
    ],
  });
};

export default mongoose.model('Account', AccountSchema);
