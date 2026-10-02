---
'@mimlet/playground': patch
---

Run JSON generation in a bounded child process and wait for its exit on cancellation or timeout. This prevents native regex work from retaining generation slots when worker-thread termination stalls. Keep the loopback-only protocol, input/output limits, heap limits and concurrency ceiling unchanged.
