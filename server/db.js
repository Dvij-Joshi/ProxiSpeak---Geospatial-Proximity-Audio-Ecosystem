import mongoose from 'mongoose';

export async function connectDB() {
  const primaryUri = process.env.MONGODB_URI;
  const localUri = process.env.LOCAL_MONGODB_URI || 'mongodb://127.0.0.1:27017/proxispeak';

  // Monitor connection lifecycle
  mongoose.connection.on('connected', () => {
    console.log('[DB] MongoDB connected (readyState = 1)');
  });
  mongoose.connection.on('disconnected', () => {
    console.warn('[DB] MongoDB disconnected (readyState = 0)');
  });
  mongoose.connection.on('reconnected', () => {
    console.log('[DB] MongoDB reconnected');
  });
  mongoose.connection.on('error', (err) => {
    console.warn('[DB] MongoDB connection error:', err.message);
  });

  let connectedUri = null;

  // 1. Try primary MONGODB_URI (e.g. Atlas)
  if (primaryUri) {
    try {
      console.log('[DB] Connecting to primary MongoDB URI...');
      await mongoose.connect(primaryUri, {
        serverSelectionTimeoutMS: 4000,
        connectTimeoutMS: 4000,
      });
      connectedUri = primaryUri;
      console.log('[DB] Connected to MongoDB Atlas/Primary successfully.');
    } catch (err) {
      console.warn(`[DB] Primary MongoDB failed (${err.message}). Trying local fallback...`);
    }
  }

  // 2. Fallback to local MongoDB instance
  if (!connectedUri && localUri) {
    try {
      console.log(`[DB] Connecting to local MongoDB at ${localUri}...`);
      await mongoose.connect(localUri, {
        serverSelectionTimeoutMS: 3000,
        connectTimeoutMS: 3000,
      });
      connectedUri = localUri;
      console.log(`[DB] Connected to local MongoDB fallback (${localUri}) successfully.`);
    } catch (localErr) {
      console.warn(`[DB] Local MongoDB fallback failed (${localErr.message}).`);
    }
  }

  if (!connectedUri) {
    throw new Error('Unable to establish connection to primary or local MongoDB.');
  }

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
