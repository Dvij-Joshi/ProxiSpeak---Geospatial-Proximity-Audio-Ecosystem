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
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
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

AccountSchema.methods.verifyPassword = async function (password) {
  return bcrypt.compare(password, this.passwordHash);
};

AccountSchema.statics.hashPassword = async function (password) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

export default mongoose.model('Account', AccountSchema);
