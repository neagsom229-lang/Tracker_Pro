// server/setup-database-guard.js — refuses to run DB-backed tests against a
// database whose name does not end in "_test".
//
// Import this module FIRST in every DB-backed test file:
//   server tests:  import './setup-database-guard.js';
//   src tests:     import '../../server/setup-database-guard.js';
//
// The check runs at module evaluation, before `pg` opens a connection, so a
// wrong name is rejected without any network or database access — in
// particular, the dev database (`tracker_db`) is never touched.
//
// Both PGDATABASE and TEST_PGDATABASE are checked: server/test-app.mjs uses
// TEST_PGDATABASE to overwrite PGDATABASE before importing the app, so either
// one being wrong must refuse.
const configured = [process.env.PGDATABASE, process.env.TEST_PGDATABASE].filter(Boolean);
const invalid = configured.find((name) => !name.endsWith('_test'));

if (invalid) {
  console.error(
    `[setup-database-guard] FATAL: configured database "${invalid}" does not end with "_test" — refusing to run.`
  );
  process.exit(1);
}

export const testDatabase = process.env.TEST_PGDATABASE ?? 'tracker_db_test';
export default testDatabase;
