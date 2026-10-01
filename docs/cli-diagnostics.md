# Diagnostics for people and coding agents

**Source preview:** `doctor`, `inspect`, JSON diagnostics and `--version` are new
in the stabilization branch, not in published `0.1.0-alpha.1`. Use matching
source tarballs until a release containing them is verified.

```sh
mimlet doctor --project . --json
mimlet inspect --schema ./schema.json --json
mimlet generate --config ./builders.json --out ./generated --check --json
mimlet --version
```

The original `mimlet --config ... --out ...` syntax is retained. `--json` selects
a machine-readable report; ordinary commands keep concise human-readable output.

## Check installed dependencies

`doctor` reads project and installed package manifests without importing app code,
running lifecycle scripts or contacting the registry. It checks installed Mimlet
packages, dependency/peer ranges, Node engine ranges and matching release trains.
Workspace symlinks and ordinary Node-style ancestor resolution are supported.
Missing optional dependencies are allowed; installed optional peers must match.

This is a dependency metadata check, not a proof that every export works, the
application compiles or its tests pass. npm tags and workspace selectors are not
resolved over the network. Unsupported or malformed manifests fail with actionable
diagnostics rather than exposing their contents.

## Inspect a JSON schema without sampling

`inspect` prepares the supported JSON Schema dialect and reports its fingerprint
and capabilities. It does not sample data, execute a native schema module, fetch
references or prove that a schema is satisfiable. Reports explicitly include
`sampled: false`. Even a boolean `false` schema can be prepared successfully while
accepting no values.

Use `--references refs.json` for an explicit offline reference map, and
`--dialect draft-07`, `draft-2019-09` or `draft-2020-12` when needed. CLI JSON input
files are capped at 2 MB. Unsupported assertions report their schema location.
Unknown failures and malformed JSON do not print fixture/schema values by default.

## Report and exit contracts

Reports contain `format: "mimlet/diagnostics"`, `version: 1`, `command`, `ok` and
`diagnostics`. Entries contain a `code`, `severity`, `message` and `hint`, with
optional package/dependency/version or schema-path context. Consumers should check
the format and version, branch on codes, and tolerate added fields/codes.

| Exit | Meaning                                                               |
| ---- | --------------------------------------------------------------------- |
| 0    | The requested check succeeded; warnings may still be present.         |
| 1    | Dependency/schema diagnostics or generated-file drift need attention. |
| 2    | Invalid invocation or input prevented the command from running.       |

`generate --check` never changes generated output. `diagnoseProject` and
`inspectSchema` are also exported from `@mimlet/codegen` for Node tooling. The
dependency-free core does not import the CLI or its filesystem/versioning helpers.
