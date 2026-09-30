# Releases and recovery

Preparing the repository, merging a PR and publishing packages are separate
operations. This source prepares toolkit `0.1.0-alpha.0` and Hey API integration
`3.0.0-alpha.0`; neither the version fields nor a green test run prove npm
publication, ownership or trusted-publisher configuration.

## Release train

The root is private. All scoped toolkit packages share a fixed Changesets version
group; the unscoped `hey-api-builders` keeps its own major version. Internal runtime
dependencies are exact. Root development links may use `workspace:*`, but published
manifests must contain the matching actual versions. `check-workspace.mjs` rejects
missing internal packages, version drift, dependency cycles, unexpected exports,
core vendor dependencies and incorrect release channels before installation.

Add a changeset for subsequent changes. The initial source versions are already
explicitly assigned; the initial metadata-only changeset does not release them.
Before subsequent alpha versioning, enter prerelease mode with
`pnpm changeset pre enter alpha`, then run `pnpm version-packages`. Review the
version plan, generated changelogs, exact internal dependency versions and package
`publishConfig.tag` fields. They must be `next` for prereleases and `latest` only
for an explicitly reviewed stable train. Refresh `pnpm-lock.yaml` after versioning
and run `pnpm check:workspace`. The guard intentionally fails rather than concealing
an incomplete version transition. Leaving prerelease mode is a deliberate operation.

## Prepare without publishing

From the reviewed commit with the pinned Node/pnpm toolchain:

```sh
pnpm install --frozen-lockfile
pnpm validate
pnpm pack:check
pnpm test:examples
node scripts/test-browser.mjs --install
pnpm release:prepare
```

`pack:check` verifies packages in a disposable location and does not require a clean
worktree. `release:prepare` requires a clean committed tree, refuses to overwrite an
existing `release` directory, and prepares that directory with all tarballs,
`manifest.json` and `SHA256SUMS`. The manifest records the source commit, complete
inventory, versions, distribution tag and SHA-256/SHA-512 digests. Package export
and ESM declaration diagnostics run against each actual tarball. Internal dependency
metadata is checked again after all packages have been packed. No publication
occurs during these commands.

Inspect the complete artifact set. Consumer tests install actual tarballs in fresh
projects; a successful workspace import is not equivalent evidence. Portable core,
browser, minimum-compiler and recipe jobs are separate acceptance gates. Performance
reports are correctness-checked measurements, not hardware-independent speed promises.

## Publish through the reviewed release workflow

The publishing trigger is a GitHub release with tag
`toolkit-v<core version>`, for example `toolkit-v0.1.0-alpha.0`. The workflow checks
that the release commit belongs to `main`, runs acceptance, audits dependencies,
prepares the verified artifacts and compares the tag/prerelease flag to the manifest.
The scoped train and Hey API integration must use the same prerelease/stable channel.

Before the first actual publication, the maintainer must establish ownership of
each npm name, configure the matching trusted publisher and the intended
`npm-publish` environment approvals, and confirm organizational release policy.
These are external account controls, not repository files, and this implementation
has not performed or verified those account changes. Do not add long-lived npm
credentials to source or generated artifacts to avoid the setup.

The publish job receives the verified artifact inventory rather than rebuilding
source with publishing credentials. It verifies archive/file identities, sizes,
digests, package metadata and the complete internal dependency graph before any
publish. The configured npm CLI publishes the tarballs with lifecycle scripts
disabled and provenance enabled. Prereleases use `next`; stable releases use `latest`.
A non-matching tag or channel fails closed.

## Failure, partial release and rollback

Publication across multiple npm packages is not transactional. The job checks all
existing package versions first. An identical already-published integrity is a
completed item; a different integrity or a failed registry request stops the job.
A retry can resume the remaining packages from the same verified artifact set.
Do not rebuild arbitrary different bytes and claim they are the same release.

Preserve the original release artifacts while investigating a partial publish.
Do not publish a replacement under a conflicting immutable version. Prepare a new
patch/prerelease train when a source or artifact correction is necessary, with
updated internal versions and new acceptance evidence. Registry errors are not
converted into permission to publish blindly.

For a bad release, consumers should pin a previous coherent train (including the
matching core and Hey API integration), or move to a corrected train. Maintainers
may deprecate a bad version and adjust distribution tags through their normal
reviewed npm process. Do not automatically unpublish packages or rewrite Git
history as a rollback. Never mix a generated v3 client with an incompatible core.

This guide describes the implemented release process. It does not report a release,
claim that package names have been reserved, or authorize publishing unreviewed
artifacts. See [acceptance](acceptance.md) and [security](../SECURITY.md).
