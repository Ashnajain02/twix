-- AlterTable
ALTER TABLE "threads" ADD COLUMN     "summary" TEXT,
ADD COLUMN     "summary_message_count" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "merge_events_source_thread_id_idx" ON "merge_events"("source_thread_id");

-- CreateIndex
CREATE INDEX "threads_parent_thread_id_idx" ON "threads"("parent_thread_id");

-- CreateIndex
CREATE INDEX "threads_conversation_id_status_idx" ON "threads"("conversation_id", "status");
