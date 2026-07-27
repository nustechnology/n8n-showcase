-- Replace the SHIPSTATION integration provider with EASYPOST.
-- Uses ALTER TYPE ... RENAME VALUE (PostgreSQL 10+) rather than recreating
-- the enum type: this is an in-place catalog rename, so any existing rows
-- with provider = 'SHIPSTATION' are relabeled automatically, not dropped.
-- Confirmed zero rows used SHIPSTATION at the time of this migration.
ALTER TYPE "IntegrationProvider" RENAME VALUE 'SHIPSTATION' TO 'EASYPOST';
