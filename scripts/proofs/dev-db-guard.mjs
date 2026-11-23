// scripts/proofs/dev-db-guard.mjs — every proof script in this directory talks
// to the dev stack and/or the dev database (tracker_db). Import this module
// FIRST so the refusal happens before any connection is opened.
if (process.env.ALLOW_DEV_DB !== '1') {
  console.error(
    '[proofs] Refusing to run: these scripts use the dev stack/database. Set ALLOW_DEV_DB=1 to allow it.'
  );
  process.exit(1);
}
