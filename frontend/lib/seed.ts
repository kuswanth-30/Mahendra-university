'use client';

import { db } from '@/lib/db';

export async function seedTestData() {
  console.log('404 FOUND: Seeding test data...');
  
  const sampleMessages = [
    {
      id: 'test-1',
      type: 'Alert',
      title: 'Structural Integrity Warning',
      content: 'Sector 7 report indicates localized failure in primary support beams. Evacuation advised.',
      timestamp: Date.now() - 1000 * 60 * 5, // 5 mins ago
      authorId: 'system-node-01',
      priority: 'high'
    },
    {
      id: 'test-2',
      type: 'News',
      title: 'Resource Rationing Update',
      content: 'Water filtration units are back at 80% capacity. Rationing remains in effect for Sector 4.',
      timestamp: Date.now() - 1000 * 60 * 60, // 1 hour ago
      authorId: 'admin-node',
      priority: 'medium'
    },
    {
      id: 'test-3',
      type: 'Direct',
      title: 'Incoming Message',
      content: 'Coordinates for the next supply drop have been encrypted in the QR drops tab.',
      timestamp: Date.now() - 1000 * 60 * 120, // 2 hours ago
      authorId: 'unknown-peer',
      priority: 'normal'
    }
  ];

  try {
    await db.messages.bulkPut(sampleMessages);
    console.log('404 FOUND: Successfully seeded 3 messages.');
    window.location.reload(); // Refresh to show data
  } catch (err) {
    console.error('Failed to seed data:', err);
  }
}
