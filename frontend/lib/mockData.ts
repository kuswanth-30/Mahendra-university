'use client';

export interface MockFeedItem {
  id: string;
  type: 'News' | 'Alert' | 'Direct';
  title: string;
  content: string;
  timestamp: number;
  authorId: string;
  priority: 'high' | 'medium' | 'low' | 'normal';
}

export const MOCK_FEED_DATA: MockFeedItem[] = [
  {
    id: 'mock-1',
    type: 'Alert',
    title: 'PROTOCOL_BREACH: SECTOR_7',
    content: 'Unidentified data packet detected in restricted subnet. Security protocols engaged. Personnel remain at stations.',
    timestamp: Date.now() - 1000 * 60 * 15, // 15 mins ago
    authorId: 'SEC_CORE_01',
    priority: 'high'
  },
  {
    id: 'mock-2',
    type: 'News',
    title: 'COMM_NETWORK_STATUS',
    content: 'Mesh relay nodes 04 through 09 are now operating on redundant power. Bandwidth may be restricted to 256kbps.',
    timestamp: Date.now() - 1000 * 60 * 45, // 45 mins ago
    authorId: 'SYS_ADMIN',
    priority: 'normal'
  },
  {
    id: 'mock-3',
    type: 'Direct',
    title: 'ENCRYPTED_HANDSHAKE',
    content: 'The handshake vector has been verified. Awaiting further instructions on the secondary frequency.',
    timestamp: Date.now() - 1000 * 60 * 120, // 2 hours ago
    authorId: 'NODE_X',
    priority: 'medium'
  },
  {
    id: 'mock-4',
    type: 'News',
    title: 'RESOURCE_OPTIMIZATION',
    content: 'Power distribution algorithm version 4.2 deployed. Expected 12% increase in battery life across mobile nodes.',
    timestamp: Date.now() - 1000 * 60 * 300, // 5 hours ago
    authorId: 'DEV_NULL',
    priority: 'low'
  }
];
