import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  readBootstrapRelease,
  validateBootstrapContext,
  validateBootstrapStatement,
} from '../../scripts/bootstrap-release.mjs';

const commit = 'a'.repeat(40);
test('first-publication signing is restricted to the exact main workflow and commit', () => {
  const context = {
    GITHUB_ACTIONS: 'true',
    GITHUB_REPOSITORY: 'JeffreyNijs/mimlet',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_SHA: commit,
    GITHUB_WORKFLOW_REF: 'JeffreyNijs/mimlet/.github/workflows/npm-bootstrap.yml@refs/heads/main',
  };
  assert.doesNotThrow(() => validateBootstrapContext(context, commit));
  for (const key of Object.keys(context))
    assert.throws(() => validateBootstrapContext({ ...context, [key]: 'wrong' }, commit));
});

test('unsigned statement checks reject mismatched source, commit, subjects and archive digest', () => {
  const pkg = { integrity: 'sha512-YQ==' };
  const statement = {
    _type: 'https://in-toto.io/Statement/v1',
    predicateType: 'https://slsa.dev/provenance/v1',
    subject: [{ digest: { sha512: '61' } }],
    predicate: {
      buildDefinition: {
        externalParameters: {
          workflow: {
            repository: 'https://github.com/JeffreyNijs/mimlet',
            path: '.github/workflows/npm-bootstrap.yml',
            ref: 'refs/heads/main',
          },
        },
        resolvedDependencies: [{ digest: { gitCommit: commit } }],
      },
    },
  };
  const wrap = (value) => ({
    dsseEnvelope: { payload: Buffer.from(JSON.stringify(value)).toString('base64') },
  });
  assert.doesNotThrow(() => validateBootstrapStatement(wrap(statement), { commit }, pkg));
  for (const mutate of [
    (s) => {
      s.subject = [];
    },
    (s) => {
      s.subject.push(s.subject[0]);
    },
    (s) => {
      s.subject[0].digest.sha512 = 'changed';
    },
    (s) => {
      s.predicate.buildDefinition.resolvedDependencies[0].digest.gitCommit = 'b'.repeat(40);
    },
    (s) => {
      s.predicate.buildDefinition.externalParameters.workflow.repository =
        'https://github.com/other/repo';
    },
    (s) => {
      s.predicate.buildDefinition.externalParameters.workflow.ref = 'refs/heads/feature';
    },
    (s) => {
      s.predicate.buildDefinition.externalParameters.workflow.path = '.github/workflows/other.yml';
    },
  ]) {
    const changed = globalThis.structuredClone(statement);
    mutate(changed);
    assert.throws(() => validateBootstrapStatement(wrap(changed), { commit }, pkg));
  }
  // Production additionally verifies the signature, OIDC issuer and certificate
  // identity with npm's Sigstore implementation before any registry write.
});

test('bootstrap preflight verifies actual tarballs and rejects tampering before publication', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mimlet-bootstrap-'));
  const artifacts = join(root, 'release');
  await mkdir(artifacts);
  try {
    const packages = [];
    for (const name of ['mimlet', 'hey-api-builders']) {
      const version = name === 'mimlet' ? '0.1.0-alpha.0' : '3.0.0-alpha.0';
      const folder = join(root, name, 'package');
      await mkdir(folder, { recursive: true });
      await writeFile(
        join(folder, 'package.json'),
        JSON.stringify({
          name,
          version,
          private: false,
          repository: { url: 'git+https://github.com/JeffreyNijs/mimlet.git' },
          publishConfig: { provenance: true },
          dependencies: name === 'mimlet' ? {} : { mimlet: '0.1.0-alpha.0' },
        })
      );
      const filename = `${name}-${version}.tgz`;
      execFileSync('tar', ['-czf', join(artifacts, filename), '-C', join(root, name), 'package']);
      const bytes = await readFile(join(artifacts, filename));
      packages.push({
        name,
        version,
        filename,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
      });
    }
    await writeFile(
      join(artifacts, 'manifest.json'),
      JSON.stringify({
        format: 1,
        commit,
        coreVersion: '0.1.0-alpha.0',
        tag: 'toolkit-v0.1.0-alpha.0',
        distTag: 'next',
        packages,
      })
    );
    await writeFile(join(artifacts, 'SHA256SUMS'), '');
    assert.equal((await readBootstrapRelease(artifacts)).metadata.length, 2);
    await writeFile(join(artifacts, packages[0].filename), 'tampered');
    await assert.rejects(readBootstrapRelease(artifacts), /digest mismatch/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
