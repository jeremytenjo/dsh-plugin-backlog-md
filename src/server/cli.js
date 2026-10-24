/** Backlog.md CLI helpers: argv-only execution, bounded output, version gates. */

export const MIN_BACKLOG_VERSION = '1.30.0';
export const TESTED_BACKLOG_VERSION = '1.55.3';
const MAX_OUTPUT_BYTES = 512 * 1024;

function readCollected(reader, limit = MAX_OUTPUT_BYTES) {
  if (!reader) return '';
  try {
    return reader.readFrom(0).text.slice(0, limit);
  } catch {
    return '';
  }
}

/** Parse a Backlog.md version from free-form CLI output. */
export function parseVersion(output) {
  const match = /(?:^|[^\d])(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?/.exec(String(output ?? ''));
  if (!match) return null;
  return `${match[1]}.${match[2]}.${match[3]}`;
}

/** Compare dotted numeric versions, ignoring pre-release identifiers. */
export function compareVersions(left, right) {
  const a = String(left)
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0);
  const b = String(right)
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }
  return 0;
}

export function isVersionSupported(version) {
  if (!version) return false;
  const parsed = parseVersion(version);
  if (!parsed) return false;
  return compareVersions(parsed, MIN_BACKLOG_VERSION) >= 0 && compareVersions(parsed, '2.0.0') < 0;
}

/**
 * Run the Backlog.md CLI with an argv array. A shell is never involved and the
 * caller's cwd is always a canonical project root.
 */
export async function runBacklogCli({
  spawn,
  executable,
  args,
  cwd,
  timeoutMs = 15000,
  signal,
  env,
}) {
  if (typeof spawn !== 'function') throw new Error('The subprocess service is unavailable.');
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== 'string' || arg.includes('\0'))) {
    throw new Error('Invalid Backlog.md CLI arguments.');
  }
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(new Error('CLI timed out')), timeoutMs);
  if (typeof timer.unref === 'function') timer.unref();

  let handle;
  try {
    handle = await spawn({
      argv: [executable, ...args],
      cwd,
      stdio: {
        stdin: 'ignore',
        stdout: { maxBytes: MAX_OUTPUT_BYTES },
        stderr: { maxBytes: MAX_OUTPUT_BYTES },
      },
      graceMs: 4000,
      signal: controller.signal,
      ...(env ? { env } : {}),
    });
  } catch (error) {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    throw error;
  }

  let outcome;
  try {
    outcome = await handle.done;
  } catch (error) {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }

  const stdout = readCollected(handle.collected?.stdout);
  const stderr = readCollected(handle.collected?.stderr);
  return {
    code: outcome?.exitCode ?? 1,
    signal: outcome?.signal ?? null,
    stdout,
    stderr,
    timedOut: controller.signal.aborted && !signal?.aborted,
  };
}

export async function readBacklogVersion({ spawn, executable, cwd, signal }) {
  const result = await runBacklogCli({
    spawn,
    executable,
    args: ['--version'],
    cwd,
    timeoutMs: 12000,
    signal,
  });
  const text = `${result.stdout}\n${result.stderr}`.trim();
  const version = parseVersion(text);
  return { version, result };
}
