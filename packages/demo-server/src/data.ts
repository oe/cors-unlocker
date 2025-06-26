import type { IUser } from './types';

/**
 * Mock user data for testing
 */
export const mockUsers: IUser[] = [
  {
    id: 1,
    name: 'John Doe',
    email: 'john@example.com',
    createdAt: '2024-01-15T10:30:00Z',
    role: 'admin',
  },
  {
    id: 2,
    name: 'Jane Smith',
    email: 'jane@example.com',
    createdAt: '2024-01-16T14:20:00Z',
    role: 'user',
  },
  {
    id: 3,
    name: 'Bob Johnson',
    email: 'bob@example.com',
    createdAt: '2024-01-17T09:15:00Z',
    role: 'user',
  },
  {
    id: 4,
    name: 'Alice Wilson',
    email: 'alice@example.com',
    createdAt: '2024-01-18T16:45:00Z',
    role: 'moderator',
  },
];

/**
 * Generate a new user ID
 */
export function generateUserId(): number {
  return mockUsers.length > 0 ? Math.max(...mockUsers.map(u => u.id)) + 1 : 1;
}

/**
 * Find user by ID
 */
export function findUserById(id: number): IUser | undefined {
  return mockUsers.find(user => user.id === id);
}

/**
 * Create a new user
 */
export function createUser(userData: Omit<IUser, 'id' | 'createdAt'>): IUser {
  const newUser: IUser = {
    ...userData,
    id: generateUserId(),
    createdAt: new Date().toISOString(),
  };
  mockUsers.push(newUser);
  return newUser;
}

/**
 * Update an existing user
 */
export function updateUser(id: number, userData: Partial<Omit<IUser, 'id' | 'createdAt'>>): IUser | null {
  const userIndex = mockUsers.findIndex(user => user.id === id);
  if (userIndex === -1) return null;
  
  mockUsers[userIndex] = { ...mockUsers[userIndex], ...userData };
  return mockUsers[userIndex];
}

/**
 * Delete a user
 */
export function deleteUser(id: number): boolean {
  const userIndex = mockUsers.findIndex(user => user.id === id);
  if (userIndex === -1) return false;
  
  mockUsers.splice(userIndex, 1);
  return true;
}

/**
 * Generate a mock authentication token
 */
export function generateAuthToken(userId: number): string {
  const timestamp = Date.now();
  const payload = Buffer.from(JSON.stringify({ userId, timestamp })).toString('base64');
  return `mock_token_${payload}`;
}

/**
 * Validate authentication token
 */
export function validateAuthToken(token: string): { userId: number; isValid: boolean } {
  try {
    if (!token.startsWith('mock_token_')) {
      return { userId: 0, isValid: false };
    }
    
    const payload = token.replace('mock_token_', '');
    const decoded = JSON.parse(Buffer.from(payload, 'base64').toString());
    const { userId, timestamp } = decoded;
    
    // Token expires after 24 hours
    const isExpired = Date.now() - timestamp > 24 * 60 * 60 * 1000;
    
    return { userId, isValid: !isExpired };
  } catch {
    return { userId: 0, isValid: false };
  }
}
