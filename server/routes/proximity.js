import express from 'express';
import {
  getNearbyUsers,
  updateUserPosition,
  getRoomUsers,
} from '../controllers/proximityController.js';

const router = express.Router();

/**
 * GET /api/proximity/:userId
 * Returns all users within earshot (100-unit radius) of the given user.
 */
router.get('/:userId', getNearbyUsers);

/**
 * POST /api/proximity/update
 * Updates the user's canvas position and returns nearby users.
 */
router.post('/update', updateUserPosition);

/**
 * GET /api/proximity/room/:roomId
 * Returns all active users in the specified virtual room.
 */
router.get('/room/:roomId', getRoomUsers);

export default router;
