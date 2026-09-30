# Mimlet website launch

The toolkit completion and branding PRs (#21 and #22) have merged. The repository
is now `JeffreyNijs/mimlet`, and the public site is live at
<https://jeffreynijs.github.io/mimlet/>. The project controls the `@mimlet` npm
organization. Initial package publication is still pending; the core uses
`@mimlet/core` after npm rejected the unscoped `mimlet` name.

## Review without publishing

```sh
pnpm install --frozen-lockfile
pnpm validate
pnpm test:examples
pnpm docs:build
pnpm docs:test
pnpm audit:production
```

`pnpm docs:dev` watches the canonical Markdown, package READMEs, recipe sources and
brand assets. `pnpm docs:preview` serves the built site on loopback port 4174 under
`/mimlet/`. HTML, Markdown alternates and `llms.txt` are built from the same sources.
The documentation application is private and is never part of the 17-package release.

Website CI builds an artifact for review on pull requests, including stacked PRs.
Deployment is restricted to `main` in `JeffreyNijs/mimlet`; feature branches
cannot trigger a public deployment. Package publication
continues to use its separate protected release workflow.

## Deployment checklist

The repository rename, environment configuration and first site deployment are
complete. Use this checklist when checking the deployment or preparing a future
repository move:

1. Confirm both PRs and all required checks are merged into `main`. Verify control
   of the intended npm names and `@mimlet` organization before scheduling a package
   release; registry 404 responses do not establish ownership.
   Keep the first toolkit publication on hold until both PRs are merged so it uses
   one coherent package identity and dependency graph.
2. Rename the GitHub repository to `JeffreyNijs/mimlet`. Update its description to
   “Schema-aware test data: typed fixtures, coherent scenarios, and replayable failures.”
   Update affected remotes and repository-dependent publisher/environment settings.
   Preserve the old repository redirect; do not create another repository at its old name.
3. In GitHub Pages, select GitHub Actions as the publishing source and configure
   the `github-pages` environment to allow only `main`.
4. Dispatch **Mimlet website** on `main`, or let a subsequent main push run it.
   The job builds with `/mimlet/`, using the renamed repository and main source links.
5. Verify the homepage, a deep documentation URL, search, dark/mobile layouts,
   `llms.txt`, a Markdown alternate, favicon and social image at
   `https://jeffreynijs.github.io/mimlet/`. Update the repository homepage to that URL.
6. Update the source-preview clone command to the renamed repository's `main`
   branch. Keep the unpublished-package notice and local-tarball workflow until
   actual npm ownership, trusted publishing and publication are verified.

The checked-in GitHub links use `JeffreyNijs/mimlet` and default to `main`.
`DOCS_SOURCE_REF` can select the reviewed source revision. Pages project URLs
do not share GitHub's repository-URL redirects. There is no prior Pages site to migrate.

## Package publication stays separate

Follow [releases](releases.md) to publish the matching train from verified artifacts.
Confirm the registry versions and integrity values before replacing source-preview
instructions with public install commands. Retain the `hey-api-builders` npm identity
and the documented [saved-data compatibility identifiers](mimlet-migration.md).

## Recovery

If a site deployment fails, inspect the failed Pages job and retry the same reviewed
commit. For a bad site build, deploy a previous known-good commit from `main` through
the same workflow. Site recovery must not publish or roll back npm packages. Retain
the generated artifact and check results when investigating broken paths or content.
