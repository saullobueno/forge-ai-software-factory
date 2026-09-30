CREATE TABLE "playground_dataset_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"dataset_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"items" jsonb NOT NULL,
	"note" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playground_datasets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "ai_provider" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "instructions" text;--> statement-breakpoint
ALTER TABLE "playground_dataset_versions" ADD CONSTRAINT "playground_dataset_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playground_dataset_versions" ADD CONSTRAINT "playground_dataset_versions_dataset_id_playground_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."playground_datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playground_dataset_versions" ADD CONSTRAINT "playground_dataset_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playground_datasets" ADD CONSTRAINT "playground_datasets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playground_datasets" ADD CONSTRAINT "playground_datasets_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "playground_dataset_versions_organization_id_idx" ON "playground_dataset_versions" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "playground_dataset_versions_dataset_version_idx" ON "playground_dataset_versions" USING btree ("dataset_id","version");--> statement-breakpoint
CREATE INDEX "playground_datasets_organization_id_idx" ON "playground_datasets" USING btree ("organization_id");