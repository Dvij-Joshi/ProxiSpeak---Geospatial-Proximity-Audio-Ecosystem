import mongoose from 'mongoose';

// Disable buffering so queries fail immediately instead of hanging indefinitely
// when MongoDB is disconnected or undergoing network reconnection
mongoose.set('bufferCommands', false);

export async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not set in environment variables');

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
  });
  console.log('[DB] Connected to MongoDB Atlas');

  try {
    const col = mongoose.connection.collection('users');
    const indexes = await col.indexes();
    for (const idx of indexes) {
      if (idx.name.startsWith('location_')) {
        await col.dropIndex(idx.name);
        console.log(`[DB] Dropped legacy index: ${idx.name}`);
      }
    }
  } catch (_e) {
    // collection may not exist yet on fresh database
  }
}

