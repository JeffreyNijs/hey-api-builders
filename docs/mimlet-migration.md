# From Test Builders to Mimlet

Mimlet is the same schema-independent toolkit under a new product identity.
The core is `mimlet`; the optional packages use `@mimlet/*`. These names describe
the prepared, unpublished alpha. Package ownership and publication are separate
launch steps; an install command is not evidence that a package is available.

| Previous source identity               | Mimlet identity                         |
| -------------------------------------- | --------------------------------------- |
| `@jeffreynijs/test-builders`           | `mimlet`                                |
| `@jeffreynijs/test-builders-<adapter>` | `@mimlet/<adapter>`                     |
| `test-builders --config …`             | `mimlet --config …`                     |
| `test-builders-playground`             | `mimlet-playground`                     |
| `hey-api-builders`                     | Unchanged: Mimlet's Hey API integration |

Update source imports and dependencies together. Regenerate builders with the
renamed CLI or Hey API plugin so emitted imports point to `mimlet` and `@mimlet/*`.
The Hey API plugin name, generated filename, configuration API and prepared
`3.0.0-alpha.0` version remain unchanged. Its default external runtime import is
now `mimlet`. Existing published Hey API v2 users should follow the separate
[Hey API migration guide](hey-api-migration.md).

Public functions, fluent methods, package boundaries and toolkit
`0.1.0-alpha.0` versions are preserved. No compatibility shim packages are
published for the previous unpublished neutral names. This rename does not
alter native schema behavior or turn unsupported generation into a supported capability.

## Saved data and generated-file ownership

The following are stable compatibility identifiers, not stale branding:

- `test-builders/session`, `test-builders/fixture` and `test-builders/property`
  format names, including their versions and replay algorithms.
- Provider/vendor identifiers beginning with `test-builders/`, and the synthetic
  `https://test-builders.invalid/document` base used for offline schema references.
- `.test-builders.manifest.json`, which records ownership and hashes of generated
  files. The Mimlet CLI reads and updates it so regeneration can recognize prior
  output and continue protecting handwritten edits.
- The local playground's `x-test-builders-token` request header.

Do not replace these strings inside saved fixtures or replay records. The
checked-in migration fixture was produced by the pre-rename distribution at
`017dfb5d2fd4d147d7724f468d77aa35a961e869`; executable regressions restore its
session, native values, shared references, property failure and generated ownership.

Replay still checks provider, schema/configuration identity and relevant engine
versions. A product rename does not authorize replaying data against a changed schema.

## Repository and releases

The target repository name is `JeffreyNijs/mimlet`. Its public rename and Pages
launch are coordinated after merge. During review, the existing
[repository](https://github.com/JeffreyNijs/hey-api-builders) remains the source location.
Local checkouts are not moved by this change.

The `toolkit-v<version>` release tag convention, fixed neutral-package version train,
exact internal dependencies, provenance checks and protected publication process
are retained. See [releases](releases.md) for the ownership and publication gates.
