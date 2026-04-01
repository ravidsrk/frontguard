#!/usr/bin/env node
/**
 * CLI for managing Frontguard Daytona snapshots.
 *
 * Usage:
 *   npx tsx cloud/api/src/snapshot-cli.ts create
 *   npx tsx cloud/api/src/snapshot-cli.ts list
 *   npx tsx cloud/api/src/snapshot-cli.ts delete
 */

import {
  createFrontguardSnapshot,
  listSnapshots,
  deleteFrontguardSnapshot,
} from './snapshot.js';

const command = process.argv[2];

switch (command) {
  case 'create':
    createFrontguardSnapshot().catch((err) => {
      console.error('Failed to create snapshot:', err);
      process.exit(1);
    });
    break;
  case 'list':
    listSnapshots().catch((err) => {
      console.error('Failed to list snapshots:', err);
      process.exit(1);
    });
    break;
  case 'delete':
    deleteFrontguardSnapshot().catch((err) => {
      console.error('Failed to delete snapshot:', err);
      process.exit(1);
    });
    break;
  default:
    console.log('Usage: npx tsx cloud/api/src/snapshot-cli.ts [create|list|delete]');
    process.exit(command ? 1 : 0);
}
