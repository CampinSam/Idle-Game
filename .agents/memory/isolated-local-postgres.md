---
name: Isolated local PostgreSQL
description: Environment constraints encountered when validating the API against a disposable local database.
---

The shell tool's ordinary command lifetime does not preserve a daemon started as a child with `pg_ctl`; run a local PostgreSQL server as a managed background shell task when an isolated API smoke check needs its own database. PostgreSQL's default `/run/postgresql` Unix-socket directory is absent in this environment, so a writable socket directory is necessary even when TCP is enabled.

**Why:** A disposable cluster initialized successfully, but the initial server could not create its socket lock; after changing the socket location, a `pg_ctl` launch exited with the shell tool before the next command could connect. The managed background task survived across commands.

**How to apply:** Only for future isolated local database validation, not for normal app workflows or production databases. Keep validation credentials and database state separate from the project environment and avoid using live data.