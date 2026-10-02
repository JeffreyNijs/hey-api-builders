---
'@mimlet/arktype': patch
'@mimlet/faker': patch
---

Accept ArkType 2.2.5 through 2.2.7 and Faker 10.5.0 through 10.6.0, each tested
against the packed adapter. Faker's replay identity now names the loaded Faker
release instead of always claiming 10.5.0. ArkType exposes no runtime version, so
`arkTypeAdapter().metadata` reports `supportedVersions` instead of a fixed `version`;
its generation identity still comes from the converted input schema.
