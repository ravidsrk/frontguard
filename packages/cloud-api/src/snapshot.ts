import { Daytona, Image } from '@daytonaio/sdk';

// ---------------------------------------------------------------------------
// Snapshot management — pre-bake a sandbox with Playwright + Frontguard
// ---------------------------------------------------------------------------

const SNAPSHOT_NAME = 'frontguard-playwright-v1';

/**
 * Creates a Daytona snapshot with Playwright + Chromium + Frontguard
 * pre-installed. Sandboxes created from this snapshot skip the ~60s
 * install step and boot in sub-100ms.
 *
 * Run this once (or on version bumps) via:
 *   npx tsx cloud/api/src/snapshot.ts
 */
export async function createFrontguardSnapshot(): Promise<string> {
  const daytona = new Daytona();

  console.log('Creating Frontguard snapshot...');

  // Build a custom image with Playwright baked in
  const image = Image.base('node:20-bookworm')
    .runCommands(
      'npm install -g @frontguard/cli@latest',
      'npx playwright install --with-deps chromium',
      'mkdir -p /home/daytona/output',
    );

  const snapshot = await daytona.snapshot.create(
    {
      name: SNAPSHOT_NAME,
      image,
      resources: {
        cpu: 2,
        memory: 4, // 4 GiB for Chromium
        disk: 10,
      },
      entrypoint: ['/bin/bash'],
    },
    {
      onLogs: (chunk: string) => console.log(chunk),
      timeout: 0, // No timeout — image build can be slow
    },
  );

  console.log(`\n✅ Snapshot created: ${snapshot.name} (${snapshot.id})`);
  console.log(`   Image: ${snapshot.imageName}`);
  console.log(`   State: ${snapshot.state}`);
  console.log(`\nSandboxes will now boot from this snapshot in sub-100ms.`);

  return snapshot.name;
}

/**
 * Lists available Frontguard snapshots
 */
export async function listSnapshots(): Promise<void> {
  const daytona = new Daytona();
  const result = await daytona.snapshot.list();

  console.log(`Found ${result.total} snapshots:`);
  for (const snap of result.items) {
    const isFrontguard = snap.name === SNAPSHOT_NAME ? ' ⭐' : '';
    console.log(`  ${snap.name} — ${snap.state} (${snap.imageName})${isFrontguard}`);
  }
}

/**
 * Deletes the Frontguard snapshot (for rebuilding)
 */
export async function deleteFrontguardSnapshot(): Promise<void> {
  const daytona = new Daytona();
  const snapshot = await daytona.snapshot.get(SNAPSHOT_NAME);
  await daytona.snapshot.delete(snapshot);
  console.log(`✅ Snapshot "${SNAPSHOT_NAME}" deleted.`);
}

// CLI entrypoint — run via: npx tsx cloud/api/src/snapshot-cli.ts [create|list|delete]
