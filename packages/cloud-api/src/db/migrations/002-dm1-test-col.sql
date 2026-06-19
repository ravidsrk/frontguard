-- DM-1 acceptance fixture: proves additive ALTER TABLE migrations work.
-- Safe to re-run only via the ledger; remove or supersede when no longer needed.
ALTER TABLE users ADD COLUMN dm1_test_col TEXT;