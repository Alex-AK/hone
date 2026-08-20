/**
 * Every call into the store and the clock is recorded with the workout's own
 * files on its stack, which is what the last two checkpoints read.
 *
 * The record lives on `globalThis` rather than in this module, because a
 * checkpoint that wants to know what importing a module pulls in has to start
 * from an empty module registry, and that would take a module-scoped array with
 * it.
 */

export interface Access {
  readonly name: string;
  /** The workout's own files on the stack, nearest first, deduplicated. */
  readonly frames: readonly string[];
}

interface Journal {
  accesses: Access[];
  loaded: string[];
}

interface CallSite {
  getFileName(): string | null;
}

const KEY = '__honeReminderRulesJournal';

function journal(): Journal {
  const holder = globalThis as unknown as Record<string, Journal | undefined>;
  const existing = holder[KEY];
  if (existing) return existing;
  const fresh: Journal = { accesses: [], loaded: [] };
  holder[KEY] = fresh;
  return fresh;
}

/**
 * V8's structured stack, so the file each frame is in comes back as a value
 * rather than as text that has to be parsed back out of a message.
 */
function callers(): string[] {
  const prepare = Error.prepareStackTrace;
  const limit = Error.stackTraceLimit;
  Error.stackTraceLimit = 50;
  Error.prepareStackTrace = (_error, sites) => sites;
  const holder: { stack?: unknown } = {};
  Error.captureStackTrace(holder, callers);
  const sites = holder.stack as CallSite[];
  Error.prepareStackTrace = prepare;
  Error.stackTraceLimit = limit;

  const files: string[] = [];
  for (const site of sites) {
    const file = site.getFileName() ?? '';
    const at = file.lastIndexOf('/src/');
    if (at === -1) continue;
    const name = file.slice(at + '/src/'.length);
    if (!files.includes(name)) files.push(name);
  }
  return files;
}

export function record(name: string): void {
  journal().accesses.push({ name, frames: callers() });
}

export function accesses(): readonly Access[] {
  return journal().accesses;
}

export function clearAccesses(): void {
  journal().accesses.length = 0;
}

export function markLoaded(name: string): void {
  journal().loaded.push(name);
}

export function loadedModules(): readonly string[] {
  return journal().loaded;
}

export function clearLoaded(): void {
  journal().loaded.length = 0;
}
