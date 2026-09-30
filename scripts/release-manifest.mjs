/** Pure release metadata checks shared by local preparation and release verification. */
import { versionPattern } from './check-workspace.mjs';
export function validateReleaseManifest(value, expectedTag) {
  const fail = (message) => {
    throw new Error(`Release: ${message}`);
  };
  if (
    !value ||
    value.format !== 1 ||
    !/^[a-f0-9]{40}$/.test(value.commit ?? '') ||
    !versionPattern.test(value.coreVersion ?? '')
  )
    fail('invalid release identity');
  const tag = `toolkit-v${value.coreVersion}`;
  if (value.tag !== tag || (expectedTag !== undefined && expectedTag !== tag))
    fail('release tag does not match the core version');
  if (value.distTag !== (value.coreVersion.includes('-') ? 'next' : 'latest'))
    fail('incorrect distribution tag');
  if (!Array.isArray(value.packages) || value.packages.length < 2 || value.packages.length > 64)
    fail('invalid package inventory');
  const names = new Set(),
    files = new Set();
  for (const item of value.packages) {
    if (
      !item ||
      !/^(hey-api-builders|@jeffreynijs\/test-builders(?:-[a-z0-9]+)*)$/.test(item.name ?? '') ||
      !versionPattern.test(item.version ?? '')
    )
      fail('invalid package identity');
    const filename = `${item.name.replace('@', '').replace('/', '-')}-${item.version}.tgz`;
    if (item.filename !== filename || files.has(filename) || names.has(item.name))
      fail('invalid or duplicate artifact filename');
    if (
      !/^[a-f0-9]{64}$/.test(item.sha256 ?? '') ||
      !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(item.integrity ?? '')
    )
      fail('missing artifact digest');
    if (item.name.startsWith('@jeffreynijs/') && item.version !== value.coreVersion)
      fail('neutral packages must share the release train version');
    if (item.version.includes('-') !== value.coreVersion.includes('-'))
      fail('stable and prerelease packages cannot be mixed');
    names.add(item.name);
    files.add(filename);
  }
  if (value.packages[0].name !== '@jeffreynijs/test-builders' || !names.has('hey-api-builders'))
    fail('core must be first and the integration must be included');
  return value;
}
