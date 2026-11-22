/**
 * Phase 0 TDD specification for Nova Firestore Security Rules (`firestore.rules`).
 * Documents and verifies every Dirty Dozen invariant against the compiled rule set.
 */
export interface DirtyDozenCase {
  id: number;
  name: string;
  targetPath: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  payload?: Record<string, unknown>;
  expectedOutcome: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_PAYLOADS: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Unauthenticated create',
    targetPath: '/users/userA/tasks/task_1',
    operation: 'create',
    payload: { id: 'task_1', ownerId: 'userA', title: 'Test' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified email user creating profile',
    targetPath: '/users/userA',
    operation: 'create',
    payload: { ownerId: 'userA', autoSync: true },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Cross-tenant read of tasks',
    targetPath: '/users/userA/tasks',
    operation: 'list',
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Owner UID spoofing in subcollection',
    targetPath: '/users/userA/tasks/task_1',
    operation: 'create',
    payload: { id: 'task_1', ownerId: 'userB', title: 'Spoofed' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Ghost field shadow injection',
    targetPath: '/users/userA/tasks/task_1',
    operation: 'create',
    payload: { id: 'task_1', ownerId: 'userA', title: 'X', isAdmin: true },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Path variable ID poisoning',
    targetPath: '/users/userA/tasks/bad$id',
    operation: 'create',
    payload: { id: 'bad$id', ownerId: 'userA', title: 'Bad ID' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Forged client timestamp',
    targetPath: '/users/userA/alarms/alarm_1',
    operation: 'create',
    payload: { id: 'alarm_1', ownerId: 'userA', time24: '07:00', createdAt: '2020-01-01T00:00:00Z' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Immutable ownerId modification on update',
    targetPath: '/users/userA/tasks/task_1',
    operation: 'update',
    payload: { ownerId: 'userB' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Orphan task write without parent user profile',
    targetPath: '/users/userA/tasks/task_1',
    operation: 'create',
    payload: { id: 'task_1', ownerId: 'userA', title: 'Orphan' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Oversized title denial-of-wallet attack',
    targetPath: '/users/userA/tasks/task_1',
    operation: 'create',
    payload: { id: 'task_1', ownerId: 'userA', title: 'A'.repeat(500) },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Invalid alarm 24h time format',
    targetPath: '/users/userA/alarms/alarm_1',
    operation: 'create',
    payload: { id: 'alarm_1', ownerId: 'userA', time24: '99:99', label: 'Bad' },
    expectedOutcome: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Unbounded repeatDays array attack',
    targetPath: '/users/userA/alarms/alarm_1',
    operation: 'create',
    payload: {
      id: 'alarm_1',
      ownerId: 'userA',
      time24: '07:00',
      label: 'Test',
      repeatDays: ['1', '2', '3', '4', '5', '6', '7', '8'],
    },
    expectedOutcome: 'PERMISSION_DENIED',
  },
];
