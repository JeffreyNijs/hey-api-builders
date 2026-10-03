---
'@mimlet/json-schema': patch
---

Generate `format: date-time` values as varied UTC instants within a year of the session
reference time. Previously every value was the reference day at `01:01:01.0Z`, and the
day came from the machine's local time zone, so the same seed produced different
fixtures in different time zones. Schemas that use the built-in date-time generator get
a new replay configuration, so sessions recorded with the old values fail explicitly
instead of replaying different data; other schemas keep their identity.
