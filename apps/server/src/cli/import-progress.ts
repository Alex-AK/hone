import { existsSync, readFileSync } from 'node:fs';

/**
 * Merge a progress file from another machine into this one:
 *
 *   pnpm hone:import progress.json
 *
 * Merging never discards local work, so it is safe to run in either direction.
 */
import { APP_DB_PATH, ensureDataDir } from '../common/paths';
import { openAppDatabase, runMigrations } from '../db/client';
import { LOCAL_USER_ID } from '../seed/seed';
import { importProgress, parseExport } from '../transfer/transfer';

function main(): void {
  const [path] = process.argv.slice(2);
  if (!path || path === '--help' || path === '-h') {
    console.error('Usage: pnpm hone:import <progress.json>');
    process.exitCode = path ? 0 : 1;
    return;
  }
  if (!existsSync(path)) {
    console.error(`hone: no file at ${path}`);
    process.exitCode = 1;
    return;
  }

  let payload;
  try {
    payload = parseExport(readFileSync(path, 'utf8'));
  } catch (error) {
    console.error(`hone: ${path} is unusable — ${(error as Error).message}`);
    process.exitCode = 1;
    return;
  }

  ensureDataDir();
  const { db, sqlite } = openAppDatabase(APP_DB_PATH);
  try {
    runMigrations(db);
    const report = importProgress(db, LOCAL_USER_ID, payload);
    console.log(`hone: merged ${path} (exported ${payload.exportedAt})`);
    console.log(`  attempts added:     ${report.attemptsAdded}`);
    console.log(`  progress inserted:  ${report.progressInserted}`);
    console.log(`  progress merged:    ${report.progressMerged}`);
    console.log(
      `  sessions added:     ${report.sessionsAdded} (${report.sessionsSkipped} already here)`
    );
    console.log(`  workout attempts:   ${report.workoutsAdded}`);
    if (report.unknownSlugs.length) {
      // Named rather than counted: the usual cause is the two machines sitting
      // on different commits, and knowing which slugs says which way.
      console.log(`\n  ${report.unknownSlugs.length} slug(s) this machine does not have:`);
      for (const slug of report.unknownSlugs) console.log(`    ${slug}`);
    }
  } finally {
    sqlite.close();
  }
}

main();
