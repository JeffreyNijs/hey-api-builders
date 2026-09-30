import assert from 'node:assert/strict';
import { it } from 'node:test';
import { mkdtemp, mkdir, writeFile, rm, readFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readWorkspace } from '../../scripts/check-workspace.mjs';
const baseline = await readWorkspace();
async function fixture(action) {
  const root = await mkdtemp(join(tmpdir(), 'toolkit-workspace-test-'));
  const write = async (path, value) => {
    await mkdir(join(root, path, '..'), { recursive: true });
    await writeFile(join(root, path), typeof value === 'string' ? value : JSON.stringify(value));
  };
  const change = async (path, edit) => {
    const value = JSON.parse(await readFile(join(root, path), 'utf8'));
    edit(value);
    await write(path, value);
  };
  try {
    await write('package.json', baseline.manifest);
    for (const item of baseline.packages) {
      const name = item.directory.split(/[\\/]/).at(-1);
      await write(`packages/${name}/package.json`, item.manifest);
      await write(`packages/${name}/README.md`, 'Test readme');
      await write(`packages/${name}/LICENSE`, 'MIT');
    }
    await action({ root, write, change });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
it('recognizes the complete workspace and orders internal dependencies first', () =>
  fixture(async ({ root }) => {
    const workspace = await readWorkspace(root);
    const names = workspace.packages.map((item) => item.manifest.name);
    assert.equal(names[0], '@mimlet/core');
    for (const item of workspace.packages)
      for (const dependency of Object.keys(item.manifest.dependencies ?? {})) {
        if (names.includes(dependency))
          assert.ok(names.indexOf(dependency) < names.indexOf(item.manifest.name));
      }
  }));
it('rejects missing/mismatched internal packages before installation falls back to npm', () =>
  fixture(async ({ root, change }) => {
    const path = 'packages/adapter/package.json';
    await change(path, (pkg) => {
      pkg.dependencies['@mimlet/core'] = '99.0.0';
    });
    await assert.rejects(readWorkspace(root), /must match/);
    await change(path, (pkg) => {
      pkg.dependencies = { '@mimlet/missing': '0.1.0' };
    });
    await assert.rejects(readWorkspace(root), /missing internal/);
    await change(path, (pkg) => {
      pkg.dependencies = { mimlet: '0.1.0-alpha.0' };
    });
    await assert.rejects(readWorkspace(root), /missing internal/);
  }));
it('rejects accidental root publication, package metadata drift, cycles and runtime coupling', async () => {
  const changes = [
    [
      'package.json',
      (pkg) => {
        pkg.private = false;
      },
      /root must be private/,
    ],
    [
      'packages/core/package.json',
      (pkg) => {
        pkg.private = true;
      },
      /publishing boundary/,
    ],
    [
      'packages/core/package.json',
      (pkg) => {
        pkg.version = '../bad';
      },
      /invalid version/,
    ],
    [
      'packages/core/package.json',
      (pkg) => {
        pkg.name = '@other/core';
      },
      /mismatch/,
    ],
    [
      'packages/core/package.json',
      (pkg) => {
        pkg.publishConfig.tag = 'latest';
      },
      /distribution tag/,
    ],
    [
      'packages/core/package.json',
      (pkg) => {
        pkg.publishConfig.provenance = false;
      },
      /provenance/,
    ],
    [
      'packages/core/package.json',
      (pkg) => {
        pkg.repository.directory = '.';
      },
      /repository metadata/,
    ],
    [
      'packages/core/package.json',
      (pkg) => {
        pkg.files.push('src');
      },
      /file selection/,
    ],
    [
      'packages/core/package.json',
      (pkg) => {
        pkg.exports['.'] = './dist/../secret.js';
      },
      /traversal/,
    ],
    [
      'packages/core/package.json',
      (pkg) => {
        pkg.exports['.'] = './src/index.ts';
      },
      /unsafe export/,
    ],
    [
      'packages/core/package.json',
      (pkg) => {
        pkg.bin = { demo: '../secret' };
      },
      /executable target/,
    ],
    [
      'packages/core/package.json',
      (pkg) => {
        pkg.dependencies = { faker: '1' };
      },
      /core must not require/,
    ],
    [
      'packages/adapter/package.json',
      (pkg) => {
        pkg.dependencies[pkg.name] = pkg.version;
      },
      /cycle/,
    ],
  ];
  for (const [path, edit, pattern] of changes)
    await fixture(async ({ root, change }) => {
      await change(path, edit);
      await assert.rejects(readWorkspace(root), pattern);
    });
});
it('does not follow symbolic package manifests', () =>
  fixture(async ({ root }) => {
    const path = join(root, 'packages/core/package.json');
    const value = await readFile(path);
    await rm(path);
    await writeFile(join(root, 'other.json'), value);
    await symlink(join(root, 'other.json'), path);
    await assert.rejects(readWorkspace(root), /symbolic links/);
  }));
