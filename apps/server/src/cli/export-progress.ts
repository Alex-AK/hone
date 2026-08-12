import { existsSync, writeFileSync } from 'node:fs';

/**
 * Write this machine's progress out as JSON:
 *
 *   pnpm hone:export progress.json
 *   pnpm hone:export > progress.json     # stdout when no path is given
 *
 * Diagnostics go to stderr so the redirect stays clean.
 */
import { APP_DB_PATH } from '../common/paths';
import { openAppDatabase } from '../db/client';
import { LOCAL_USER_ID } from '../seed/seed';
import { exportProgress } from '../transfer/transfer';

function main(): void {
  const [path] = process.argv.slice(2);

  if (!existsSync(APP_DB_PATH)) {
    console.error(`hone: no database at ${APP_DB_PATH}. Run pnpm seed first.`);
    process.exitCode = 1;
    return;
  }

  const { db, sqlite } = openAppDatabase(APP_DB_PATH);
  try {
    const payload = exportProgress(db, LOCAL_USER_ID, new Date().toISOString());
    const json = `${JSON.stringify(payload, null, 2)}\n`;
    if (path) writeFileSync(path, json);
    else process.stdout.write(json);

    const solved = Object.values(payload.problems).filter(
      (entry) => entry.progress?.status === 'solved'
    ).length;
    console.error(
      `hone: exported ${Object.keys(payload.problems).length} problems (${solved} solved), ` +
        `${payload.sessions.length} sessions, ${payload.workouts.length} workout attempts` +
        (path ? ` to ${path}` : '')
    );
  } finally {
    sqlite.close();
  }
}

main();
