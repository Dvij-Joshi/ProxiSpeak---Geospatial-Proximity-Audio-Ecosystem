import User from '../models/User.js';

const MAX_DISTANCE = Number(process.env.MAX_EARSHOT_DISTANCE) || 100;

/**
 * GET /api/proximity/:userId
 * Finds all users within MAX_DISTANCE of the given user using MongoDB $near.
 */
export const getNearbyUsers = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).lean();
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const [x, y] = user.location.coordinates;

    const nearby = await User.find({
      _id: { $ne: user._id },
      roomId: user.roomId,
      location: {
        $near: {
          $geometry: { type: 'Point', coordinates: [x, y] },
          $maxDistance: MAX_DISTANCE,
        },
      },
    }).lean();

    const nearbyUsers = nearby.map((u) => ({
      ...u,
      distance: Math.hypot(
        u.location.coordinates[0] - x,
        u.location.coordinates[1] - y
      ),
    }));

    return res.json({
      success: true,
      userId: req.params.userId,
      nearbyUsers,
      count: nearbyUsers.length,
    });
  } catch (err) {
    console.error('getNearbyUsers error:', err);
    return res.status(500).json({ success: false, error: 'DB_ERROR', message: err.message });
  }
};

/**
 * POST /api/proximity/update
 * Updates user's position and returns the current list of nearby users.
 * Body: { userId, x, y, roomId }
 */
export const updateUserPosition = async (req, res) => {
  const { userId, x, y, roomId } = req.body;

  if (!userId || x == null || y == null || !roomId) {
    return res.status(400).json({
      success: false,
      error: 'MISSING_REQUIRED_FIELD',
      message: 'userId, x, y, and roomId are required',
    });
  }

  if (x < 0 || x > 1920 || y < 0 || y > 1080) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_COORDINATES',
      message: 'x must be 0–1920, y must be 0–1080',
    });
  }

  try {
    const updated = await User.findByIdAndUpdate(
      userId,
      { location: { type: 'Point', coordinates: [x, y] }, roomId, lastSeen: new Date() },
      { new: true }
    ).lean();

    if (!updated) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const nearby = await User.find({
      _id: { $ne: userId },
      roomId,
      location: {
        $near: {
          $geometry: { type: 'Point', coordinates: [x, y] },
          $maxDistance: MAX_DISTANCE,
        },
      },
    })
      .select('_id socketId')
      .lean();

    return res.json({
      success: true,
      updated: { _id: updated._id, location: updated.location },
      nearbyUsers: nearby.map((u) => u._id),
    });
  } catch (err) {
    console.error('updateUserPosition error:', err);
    return res.status(500).json({ success: false, error: 'DB_ERROR', message: err.message });
  }
};

/**
 * GET /api/proximity/room/:roomId
 * Returns all active users in the specified virtual room.
 */
export const getRoomUsers = async (req, res) => {
  try {
    const users = await User.find({ roomId: req.params.roomId })
      .select('username avatarColor location')
      .lean();

    return res.json({
      success: true,
      roomId: req.params.roomId,
      users,
      count: users.length,
    });
  } catch (err) {
    console.error('getRoomUsers error:', err);
    return res.status(500).json({ success: false, error: 'DB_ERROR', message: err.message });
  }
};
