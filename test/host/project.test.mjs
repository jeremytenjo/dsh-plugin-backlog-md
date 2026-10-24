import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { BridgeError } from '../../src/server/errors.js';
import {
  canonicalDirectory,
  findBacklogProject,
  parseProjectConfigSummary,
  resolveBacklogExecutable,
} from '../../src/server/project.js';

async function workspace(files) {
  const root = await mkdtemp(join(tmpdir(), 'backlog-project-test-'));
  for (const [relative, contents] of Object.entries(files)) {
    const target = join(root, relative);
    await mkdir(join(target, '..'), { recursive: true });
    await writeFile(target, contents);
  }
  return { root, cleanup: () => rm(root, { recursive: true, force: true }) };
}

test('finds a Backlog.md project by walking up from a nested session directory', async () => {
  const project = await workspace({
    'backlog/config.yml':
      'project_name: "Nested project"\ndefault_port: 6455\ntask_prefix: "task"\n',
    'src/feature/.keep': '',
  });
  try {
    const nested = join(project.root, 'src', 'feature');
    const found = await findBacklogProject(nested);
    assert.ok(found);
    assert.equal(found.root, await realpath(project.root));
    assert.equal(found.projectName, 'Nested project');
    assert.equal(found.defaultPort, 6455);
    assert.equal(found.backlogDirectory, 'backlog');
    assert.equal(found.configSource, 'folder');
  } finally {
    await project.cleanup();
  }
});

test('supports .backlog and root backlog.config.yml locations', async () => {
  const dot = await workspace({ '.backlog/config.yml': 'project_name: "Dot"\n' });
  const rootConfig = await workspace({
    'backlog.config.yml': 'project_name: "Root"\nbacklog_directory: "tasks-dir"\n',
  });
  try {
    const dotFound = await findBacklogProject(dot.root);
    assert.equal(dotFound?.projectName, 'Dot');
    assert.equal(dotFound?.backlogDirectory, '.backlog');
    const rootFound = await findBacklogProject(rootConfig.root);
    assert.equal(rootFound?.projectName, 'Root');
    assert.equal(rootFound?.backlogDirectory, 'tasks-dir');
    assert.equal(rootFound?.configSource, 'root');
  } finally {
    await dot.cleanup();
    await rootConfig.cleanup();
  }
});

test('returns null when no Backlog.md project exists', async () => {
  const empty = await workspace({ 'README.md': '# no backlog here\n' });
  try {
    assert.equal(await findBacklogProject(empty.root), null);
  } finally {
    await empty.cleanup();
  }
});

test('parses only the small config subset the Host needs', () => {
  assert.deepEqual(
    parseProjectConfigSummary(
      'project_name: "My project"\ndefault_port: 7000\nbacklog_directory: ".tasks"\ntask_prefix: back\n',
    ),
    {
      projectName: 'My project',
      defaultPort: 7000,
      backlogDirectory: '.tasks',
      taskPrefix: 'back',
    },
  );
});

test('rejects missing or non-directory workspace paths with actionable codes', async () => {
  await assert.rejects(
    () => canonicalDirectory('/definitely/missing/backlog/path'),
    (error) => error instanceof BridgeError && error.code === 'workspace-missing',
  );
  const file = await workspace({ 'file.txt': 'x' });
  try {
    await assert.rejects(
      () => canonicalDirectory(join(file.root, 'file.txt')),
      (error) => error instanceof BridgeError && error.code === 'workspace-invalid',
    );
  } finally {
    await file.cleanup();
  }
});

test('prefers a workspace-local Backlog.md binary over PATH', async () => {
  const project = await workspace({ 'backlog/config.yml': 'project_name: "Local"\n' });
  try {
    const binDir = join(project.root, 'node_modules', '.bin');
    await mkdir(binDir, { recursive: true });
    const localBin = join(binDir, 'backlog');
    await writeFile(localBin, '#!/bin/sh\nexit 0\n');
    await chmod(localBin, 0o755);
    const resolved = await resolveBacklogExecutable({
      projectRoot: project.root,
      cwd: project.root,
      resolveExecutable: async () => '/usr/local/bin/backlog',
    });
    assert.equal(resolved?.source, 'workspace');
    assert.equal(resolved?.path, localBin);

    const fromPath = await resolveBacklogExecutable({
      projectRoot: '/nonexistent',
      cwd: '/nonexistent',
      resolveExecutable: async () => '/usr/local/bin/backlog',
    });
    assert.deepEqual(fromPath, { path: '/usr/local/bin/backlog', source: 'path' });

    const missing = await resolveBacklogExecutable({
      projectRoot: '/nonexistent',
      cwd: '/nonexistent',
      resolveExecutable: async () => {
        throw new Error('not found');
      },
    });
    assert.equal(missing, null);
  } finally {
    await project.cleanup();
  }
});
