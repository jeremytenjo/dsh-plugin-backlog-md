import { constants } from 'node:fs';
import { access, readFile, realpath, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import { BridgeError } from './errors.js';

/** Config locations Backlog.md itself searches, in its documented order. */
const CONFIG_CANDIDATES = [
  ['backlog/config.yml', 'backlog', 'folder'],
  ['.backlog/config.yml', '.backlog', 'folder'],
  ['backlog.config.yml', 'backlog', 'root'],
  ['backlog.json', 'backlog', 'legacy'],
];

export function isAbsolutePath(value) {
  return (
    typeof value === 'string' &&
    (value.startsWith('/') || value.startsWith('\\\\') || /^[A-Za-z]:[\\/]/.test(value))
  );
}

async function isFile(path) {
  try {
    const info = await stat(path);
    return info.isFile();
  } catch {
    return false;
  }
}

async function isExecutableFile(path) {
  try {
    const info = await stat(path);
    if (!info.isFile()) return false;
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Resolve a directory the Host already trusts, rejecting missing or non-directory paths. */
export async function canonicalDirectory(value) {
  if (!isAbsolutePath(value)) {
    throw new BridgeError('workspace-invalid', 'This session has no usable working directory.', {
      status: 409,
    });
  }
  let target;
  try {
    target = await realpath(value);
  } catch {
    throw new BridgeError('workspace-missing', 'The session working directory no longer exists.', {
      status: 409,
    });
  }
  let info;
  try {
    info = await stat(target);
  } catch {
    throw new BridgeError('workspace-missing', 'The session working directory cannot be opened.', {
      status: 409,
    });
  }
  if (!info.isDirectory()) {
    throw new BridgeError('workspace-invalid', 'The session working directory is not a folder.', {
      status: 409,
    });
  }
  return target;
}

function unquote(value) {
  const trimmed = String(value ?? '').trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * Read the few config values the Host needs before a server exists. The full
 * configuration always comes from the official `/api/config` endpoint.
 */
export function parseProjectConfigSummary(text) {
  const summary = {};
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    const [, key, raw] = match;
    if (key === 'project_name') summary.projectName = unquote(raw);
    else if (key === 'default_port') {
      const port = Number.parseInt(unquote(raw), 10);
      if (Number.isInteger(port) && port > 0 && port < 65536) summary.defaultPort = port;
    } else if (key === 'backlog_directory') summary.backlogDirectory = unquote(raw);
    else if (key === 'task_prefix') summary.taskPrefix = unquote(raw);
  }
  return summary;
}

async function findConfigIn(directory) {
  for (const [relativePath, backlogDirectory, source] of CONFIG_CANDIDATES) {
    const configPath = join(directory, relativePath);
    if (await isFile(configPath)) {
      return { configPath, backlogDirectory, source };
    }
  }
  return null;
}

/**
 * Walk up from the session directory exactly as Backlog.md's CLI does, looking
 * for a supported backlog folder or root config. The returned root is the
 * canonical project identity used for server ownership.
 */
export async function findBacklogProject(cwd) {
  const start = await canonicalDirectory(cwd);
  let current = start;
  while (true) {
    const found = await findConfigIn(current);
    if (found) {
      const root = await realpath(current);
      let summary = {};
      try {
        summary = parseProjectConfigSummary(await readFile(found.configPath, 'utf8'));
      } catch {
        // A readable config is not required to start; /api/config is authoritative.
      }
      return {
        root,
        folder: basename(root),
        configPath: found.configPath,
        backlogDirectory: summary.backlogDirectory ?? found.backlogDirectory,
        configSource: found.source,
        defaultPort: summary.defaultPort,
        projectName: summary.projectName,
      };
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

/** A project candidate when the workspace has no Backlog.md setup yet. */
export async function projectCandidate(cwd) {
  const root = await canonicalDirectory(cwd);
  return {
    root,
    folder: basename(root),
    configPath: null,
    backlogDirectory: null,
    configSource: null,
    defaultPort: undefined,
    projectName: undefined,
  };
}

/**
 * Find the Backlog.md executable without trusting a browser-supplied path.
 * A workspace-local install wins over a PATH install.
 */
export async function resolveBacklogExecutable({ projectRoot, cwd, resolveExecutable }) {
  const names =
    process.platform === 'win32' ? ['backlog.cmd', 'backlog.exe', 'backlog'] : ['backlog'];
  const roots = [...new Set([projectRoot, cwd].filter(Boolean))];
  for (const root of roots) {
    for (const name of names) {
      const candidate = join(root, 'node_modules', '.bin', name);
      if (await isExecutableFile(candidate)) {
        return { path: candidate, source: 'workspace' };
      }
    }
  }
  if (typeof resolveExecutable === 'function') {
    try {
      const resolved = await resolveExecutable('backlog');
      if (typeof resolved === 'string' && resolved) return { path: resolved, source: 'path' };
    } catch {
      // Not installed on PATH.
    }
  }
  return null;
}

/** Keep a display path relative to the project when it lives inside it. */
export function relativeToProject(root, target) {
  if (!root || !target) return target;
  const rel = relative(root, target);
  if (!rel || rel.startsWith(`..${sep}`) || rel === '..' || isAbsolute(rel)) return target;
  return rel;
}

export function projectLabel(project) {
  return project?.projectName || project?.folder || 'Backlog';
}

export function resolveProjectPath(root, value) {
  const resolved = resolve(root, value);
  const rel = relative(root, resolved);
  if (rel === '' || rel === '.' || (!rel.startsWith('..') && !isAbsolute(rel))) return resolved;
  throw new BridgeError('invalid-path', 'That path is outside the Backlog.md project.', {
    status: 400,
  });
}
