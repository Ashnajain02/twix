-- Production-hardening migration.
--
-- 1. Enforce 200-char cap on conversation titles at the DB level (validator
--    already enforces this in app code; this is defense-in-depth).
-- 2. Add (user_id, updated_at DESC) index — the conversations dashboard query
--    filters by user and orders by updated_at every load.
-- 3. Add after_message_id index on merge_events — used as a lookup key when
--    assembling merge context for the message stream.

-- Truncate any existing rows that exceed 200 chars before tightening the type.
UPDATE "conversations" SET "title" = LEFT("title", 200) WHERE LENGTH("title") > 200;

ALTER TABLE "conversations"
  ALTER COLUMN "title" TYPE VARCHAR(200) USING LEFT("title", 200);

CREATE INDEX IF NOT EXISTS "conversations_user_id_updated_at_idx"
  ON "conversations"("user_id", "updated_at" DESC);

CREATE INDEX IF NOT EXISTS "merge_events_after_message_id_idx"
  ON "merge_events"("after_message_id");
