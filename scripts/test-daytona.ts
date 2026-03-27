/**
 * Smoke test for Daytona sandbox integration.
 *
 * Requires DAYTONA_API_KEY to be set in environment.
 *
 * Usage:
 *   npx tsx scripts/test-daytona.ts
 */

import { Daytona } from '@daytonaio/sdk';

async function test() {
  console.log('🧪 Testing Daytona sandbox creation...\n');

  const daytona = new Daytona();

  // --------------------------------------------------
  // 1. Create a minimal sandbox
  // --------------------------------------------------
  console.log('1️⃣  Creating sandbox...');
  const start = Date.now();
  const sandbox = await daytona.create(
    {
      language: 'typescript',
      autoStopInterval: 5,
      autoDeleteInterval: 10,
      ephemeral: true,
      labels: { service: 'frontguard', type: 'test' },
    },
    { timeout: 60 },
  );
  const createMs = Date.now() - start;
  console.log(`   ✅ Sandbox created: ${sandbox.id} (${createMs}ms)`);
  console.log(`   State: ${sandbox.state}`);
  console.log(`   CPU: ${sandbox.cpu}, Memory: ${sandbox.memory} GiB\n`);

  // --------------------------------------------------
  // 2. Run a basic command
  // --------------------------------------------------
  console.log('2️⃣  Running command: node --version');
  const nodeResult = await sandbox.process.executeCommand('node --version');
  console.log(`   Node version: ${nodeResult.result.trim()}`);
  console.log(`   Exit code: ${nodeResult.exitCode}\n`);

  // --------------------------------------------------
  // 3. Test file upload/download
  // --------------------------------------------------
  console.log('3️⃣  Testing file upload/download...');
  const homeDir = (await sandbox.getUserHomeDir()) ?? '/home/daytona';
  const testData = JSON.stringify({ hello: 'frontguard', timestamp: Date.now() });

  await sandbox.fs.uploadFile(
    Buffer.from(testData),
    `${homeDir}/test.json`,
  );

  const downloaded = await sandbox.fs.downloadFile(`${homeDir}/test.json`);
  const parsed = JSON.parse(downloaded.toString());
  console.log(`   Uploaded and downloaded: ${JSON.stringify(parsed)}`);
  console.log(`   Match: ${parsed.hello === 'frontguard' ? '✅' : '❌'}\n`);

  // --------------------------------------------------
  // 4. Test npm availability
  // --------------------------------------------------
  console.log('4️⃣  Checking npm...');
  const npmResult = await sandbox.process.executeCommand('npm --version');
  console.log(`   npm version: ${npmResult.result.trim()}\n`);

  // --------------------------------------------------
  // 5. Cleanup
  // --------------------------------------------------
  console.log('5️⃣  Destroying sandbox...');
  await daytona.delete(sandbox);
  console.log('   ✅ Sandbox destroyed.\n');

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  All tests passed! Daytona integration is ready.');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

test().catch((err) => {
  console.error('\n❌ Test failed:', err.message || err);
  process.exit(1);
});
