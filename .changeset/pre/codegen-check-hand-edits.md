---
'@mimlet/codegen': patch
---

Report hand-edited generated files as drift in `mimlet generate --check`: exit 1 with
`GENERATED_FILES_OUTDATED` naming the edited files, instead of exit 2 with
`COMMAND_FAILED`. A normal `generate` still refuses to overwrite them. `writeGenerated()`
results gain a `modified` list.
