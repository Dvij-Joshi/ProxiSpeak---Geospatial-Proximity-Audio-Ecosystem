import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Room from '../models/Room.js';
import connectDB from '../config/db.js';

dotenv.config();

const defaultLayout = [
  // Sound-blocking meeting room walls
  { type: 'wall', x: 100, y: 100, width: 300, height: 10, label: 'Meeting Room North Wall', blockSound: true },
  { type: 'wall', x: 100, y: 100, width: 10, height: 250, label: 'Meeting Room West Wall', blockSound: true },
  { type: 'wall', x: 400, y: 100, width: 10, height: 250, label: 'Meeting Room East Wall', blockSound: true },
  { type: 'wall', x: 100, y: 350, width: 220, height: 10, label: 'Meeting Room South Wall', blockSound: true },
  // Open doorway between x: 320 and x: 400

  // Conference table inside meeting room
  { type: 'table', x: 200, y: 200, width: 100, height: 60, label: 'Boardroom Table', blockSound: false },

  // Open workspace desks
  { type: 'desk', x: 600, y: 150, width: 80, height: 50, label: 'Dev Desk 1', blockSound: false },
  { type: 'desk', x: 720, y: 150, width: 80, height: 50, label: 'Dev Desk 2', blockSound: false },
  { type: 'desk', x: 600, y: 240, width: 80, height: 50, label: 'Dev Desk 3', blockSound: false },
  { type: 'desk', x: 720, y: 240, width: 80, height: 50, label: 'Dev Desk 4', blockSound: false },

  // Watercooler / Lounge quiet zone
  { type: 'zone', x: 950, y: 400, width: 200, height: 180, label: 'Coffee & Lounge Area', blockSound: false },
  { type: 'plant', x: 930, y: 390, width: 20, height: 20, label: 'Ficus Plant', blockSound: false },
];

async function seed() {
  try {
    await connectDB();
    console.log('🌱 Connected to MongoDB for seeding...');

    const existing = await Room.findOne({ roomId: 'main-office' });
    if (existing) {
      existing.displayName = 'Infotact Main Office';
      existing.layout = defaultLayout;
      await existing.save();
      console.log('🔄 Updated existing "main-office" layout.');
    } else {
      await Room.create({
        roomId: 'main-office',
        displayName: 'Infotact Main Office',
        isLocked: false,
        layout: defaultLayout,
      });
      console.log('✨ Seeded "main-office" with default layout & acoustic zones.');
    }

    console.log(`✅ Room seed completed (${defaultLayout.length} objects defined).`);
    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  }
}

seed();
