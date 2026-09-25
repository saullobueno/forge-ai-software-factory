ALTER TABLE "pull_requests" ADD COLUMN "agent_run_id" uuid;--> statement-breakpoint
ALTER TABLE "pull_requests" ADD CONSTRAINT "pull_requests_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pull_requests_agent_run_id_idx" ON "pull_requests" USING btree ("agent_run_id");