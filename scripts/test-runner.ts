import { runAllAutomatedTests } from '../src/tests/automatedTests';

async function main() {
  console.log('--- Running AppHub Automated Test Suite ---');
  const results = await runAllAutomatedTests();
  let failed = 0;
  for (const r of results) {
    if (r.passed) {
      console.log(`✓ [${r.suite}] ${r.name} (${r.durationMs}ms)`);
    } else {
      console.error(`✗ [${r.suite}] ${r.name} - FAIL: ${r.error}`);
      failed++;
    }
  }
  console.log(`\nTest results: ${results.length - failed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
