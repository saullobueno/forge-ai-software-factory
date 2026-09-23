CREATE TYPE "public"."actor_type" AS ENUM('user', 'agent', 'system');--> statement-breakpoint
CREATE TYPE "public"."agent_role" AS ENUM('planner', 'code_explorer', 'implementer', 'test_engineer', 'reviewer', 'documentation_agent');--> statement-breakpoint
CREATE TYPE "public"."agent_run_status" AS ENUM('queued', 'planning', 'executing', 'testing', 'review', 'approval_required', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."agent_step_status" AS ENUM('pending', 'running', 'succeeded', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."agent_tool_name" AS ENUM('list_files', 'read_file', 'search_code', 'inspect_git', 'get_issue', 'get_project_rules', 'write_file', 'apply_patch', 'run_command', 'run_tests', 'inspect_diff', 'create_branch', 'create_commit', 'create_pull_request');--> statement-breakpoint
CREATE TYPE "public"."ai_message_role" AS ENUM('system', 'user', 'assistant', 'tool');--> statement-breakpoint
CREATE TYPE "public"."approval_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."approval_subject_type" AS ENUM('agent_run', 'pull_request', 'deployment', 'policy_decision');--> statement-breakpoint
CREATE TYPE "public"."deployment_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'rolled_back');--> statement-breakpoint
CREATE TYPE "public"."environment_kind" AS ENUM('development', 'preview', 'staging', 'production');--> statement-breakpoint
CREATE TYPE "public"."file_change_type" AS ENUM('created', 'modified', 'deleted', 'renamed');--> statement-breakpoint
CREATE TYPE "public"."knowledge_source_kind" AS ENUM('repository_doc', 'adr', 'code_rules', 'agents_md', 'claude_md', 'readme', 'issue', 'pull_request');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('admin', 'platform_engineer', 'tech_lead', 'developer', 'qa_engineer', 'product_manager');--> statement-breakpoint
CREATE TYPE "public"."notification_kind" AS ENUM('task_assigned', 'approval_requested', 'agent_run_completed', 'agent_run_failed', 'pull_request_review_requested', 'test_run_failed', 'deployment_failed');--> statement-breakpoint
CREATE TYPE "public"."policy_decision_kind" AS ENUM('allow', 'deny', 'require_approval');--> statement-breakpoint
CREATE TYPE "public"."pull_request_status" AS ENUM('draft', 'open', 'merged', 'closed');--> statement-breakpoint
CREATE TYPE "public"."repository_provider" AS ENUM('github', 'mock');--> statement-breakpoint
CREATE TYPE "public"."secret_provider" AS ENUM('env', 'vault', 'aws_secrets_manager');--> statement-breakpoint
CREATE TYPE "public"."task_priority" AS ENUM('low', 'medium', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('backlog', 'ready', 'planning', 'in_progress', 'review', 'testing', 'done', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."test_artifact_kind" AS ENUM('log', 'coverage', 'screenshot', 'report');--> statement-breakpoint
CREATE TYPE "public"."test_run_status" AS ENUM('queued', 'running', 'passed', 'failed', 'flaky');--> statement-breakpoint
CREATE TYPE "public"."tool_call_status" AS ENUM('pending', 'succeeded', 'failed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."workspace_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TABLE "health_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note" text NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"avatar_url" text,
	"role" "member_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"tech_profile" jsonb DEFAULT '{"languages":[],"frameworks":[],"packageManager":null}'::jsonb NOT NULL,
	"architecture_notes" text,
	"code_rules" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repositories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"provider" "repository_provider" NOT NULL,
	"owner" text NOT NULL,
	"name" text NOT NULL,
	"default_branch" text DEFAULT 'main' NOT NULL,
	"url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_dependencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"depends_on_task_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"acceptance_criteria" text,
	"priority" "task_priority" DEFAULT 'medium' NOT NULL,
	"labels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"assignee_id" uuid,
	"status" "task_status" DEFAULT 'backlog' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"task_id" uuid,
	"branch_name" text NOT NULL,
	"worktree_path" text,
	"status" "workspace_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"workspace_id" uuid,
	"status" "agent_run_status" DEFAULT 'queued' NOT NULL,
	"objective" text NOT NULL,
	"scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"total_cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_run_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role" "agent_role" NOT NULL,
	"status" "agent_step_status" DEFAULT 'pending' NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"duration_ms" integer,
	"tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"role" "agent_role" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"allowed_tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_step_id" uuid NOT NULL,
	"tool_name" "agent_tool_name" NOT NULL,
	"arguments" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result" jsonb,
	"status" "tool_call_status" DEFAULT 'pending' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"policy_id" uuid,
	"tool_call_id" uuid NOT NULL,
	"tool_name" "agent_tool_name" NOT NULL,
	"decision" "policy_decision_kind" NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"agent_step_id" uuid,
	"tool_call_id" uuid,
	"role" "ai_message_role" NOT NULL,
	"content" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"agent_run_id" uuid,
	"agent_step_id" uuid,
	"ai_message_id" uuid,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"prompt_tokens" integer NOT NULL,
	"completion_tokens" integer NOT NULL,
	"total_tokens" integer NOT NULL,
	"cost_usd" numeric(12, 6) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "code_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"agent_run_id" uuid,
	"file_path" text NOT NULL,
	"change_type" "file_change_type" NOT NULL,
	"before_snapshot_id" uuid,
	"after_snapshot_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "diffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"code_change_id" uuid NOT NULL,
	"patch" text NOT NULL,
	"additions" integer DEFAULT 0 NOT NULL,
	"deletions" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"path" text NOT NULL,
	"content_hash" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pull_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"repository_id" uuid NOT NULL,
	"workspace_id" uuid,
	"task_id" uuid,
	"provider" "repository_provider" NOT NULL,
	"external_number" integer,
	"external_url" text,
	"title" text NOT NULL,
	"description" text,
	"source_branch" text NOT NULL,
	"target_branch" text NOT NULL,
	"status" "pull_request_status" DEFAULT 'draft' NOT NULL,
	"merged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"test_run_id" uuid NOT NULL,
	"test_suite_id" uuid,
	"kind" "test_artifact_kind" NOT NULL,
	"name" text NOT NULL,
	"storage_key" text NOT NULL,
	"size_bytes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"workspace_id" uuid,
	"agent_run_id" uuid,
	"triggered_by_user_id" uuid,
	"status" "test_run_status" DEFAULT 'queued' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_suites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"test_run_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" "test_run_status" DEFAULT 'queued' NOT NULL,
	"passed_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"is_flaky" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deployments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"environment_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"pull_request_id" uuid,
	"commit_sha" text NOT NULL,
	"status" "deployment_status" DEFAULT 'queued' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"deployed_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "environments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"kind" "environment_kind" NOT NULL,
	"name" text NOT NULL,
	"url" text,
	"is_protected" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"knowledge_source_id" uuid NOT NULL,
	"content" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"token_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid,
	"workspace_id" uuid,
	"kind" "knowledge_source_kind" NOT NULL,
	"title" text NOT NULL,
	"uri" text NOT NULL,
	"version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"subject_type" "approval_subject_type" NOT NULL,
	"subject_id" uuid NOT NULL,
	"status" "approval_status" DEFAULT 'pending' NOT NULL,
	"requested_by_user_id" uuid,
	"approved_by_user_id" uuid,
	"reason" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "secret_references" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid,
	"environment_id" uuid,
	"name" text NOT NULL,
	"provider" "secret_provider" NOT NULL,
	"external_ref" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"related_entity_type" text,
	"related_entity_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_depends_on_task_id_tasks_id_fk" FOREIGN KEY ("depends_on_task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_steps" ADD CONSTRAINT "agent_steps_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_calls" ADD CONSTRAINT "tool_calls_agent_step_id_agent_steps_id_fk" FOREIGN KEY ("agent_step_id") REFERENCES "public"."agent_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_decisions" ADD CONSTRAINT "policy_decisions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_decisions" ADD CONSTRAINT "policy_decisions_policy_id_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_decisions" ADD CONSTRAINT "policy_decisions_tool_call_id_tool_calls_id_fk" FOREIGN KEY ("tool_call_id") REFERENCES "public"."tool_calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_agent_step_id_agent_steps_id_fk" FOREIGN KEY ("agent_step_id") REFERENCES "public"."agent_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_tool_call_id_tool_calls_id_fk" FOREIGN KEY ("tool_call_id") REFERENCES "public"."tool_calls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usages" ADD CONSTRAINT "ai_usages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usages" ADD CONSTRAINT "ai_usages_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usages" ADD CONSTRAINT "ai_usages_agent_step_id_agent_steps_id_fk" FOREIGN KEY ("agent_step_id") REFERENCES "public"."agent_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usages" ADD CONSTRAINT "ai_usages_ai_message_id_ai_messages_id_fk" FOREIGN KEY ("ai_message_id") REFERENCES "public"."ai_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_changes" ADD CONSTRAINT "code_changes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_changes" ADD CONSTRAINT "code_changes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_changes" ADD CONSTRAINT "code_changes_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_changes" ADD CONSTRAINT "code_changes_before_snapshot_id_file_snapshots_id_fk" FOREIGN KEY ("before_snapshot_id") REFERENCES "public"."file_snapshots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_changes" ADD CONSTRAINT "code_changes_after_snapshot_id_file_snapshots_id_fk" FOREIGN KEY ("after_snapshot_id") REFERENCES "public"."file_snapshots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diffs" ADD CONSTRAINT "diffs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diffs" ADD CONSTRAINT "diffs_code_change_id_code_changes_id_fk" FOREIGN KEY ("code_change_id") REFERENCES "public"."code_changes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_snapshots" ADD CONSTRAINT "file_snapshots_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_snapshots" ADD CONSTRAINT "file_snapshots_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pull_requests" ADD CONSTRAINT "pull_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pull_requests" ADD CONSTRAINT "pull_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pull_requests" ADD CONSTRAINT "pull_requests_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pull_requests" ADD CONSTRAINT "pull_requests_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pull_requests" ADD CONSTRAINT "pull_requests_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_artifacts" ADD CONSTRAINT "test_artifacts_test_run_id_test_runs_id_fk" FOREIGN KEY ("test_run_id") REFERENCES "public"."test_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_artifacts" ADD CONSTRAINT "test_artifacts_test_suite_id_test_suites_id_fk" FOREIGN KEY ("test_suite_id") REFERENCES "public"."test_suites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_runs" ADD CONSTRAINT "test_runs_triggered_by_user_id_users_id_fk" FOREIGN KEY ("triggered_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_suites" ADD CONSTRAINT "test_suites_test_run_id_test_runs_id_fk" FOREIGN KEY ("test_run_id") REFERENCES "public"."test_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_pull_request_id_pull_requests_id_fk" FOREIGN KEY ("pull_request_id") REFERENCES "public"."pull_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_deployed_by_user_id_users_id_fk" FOREIGN KEY ("deployed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environments" ADD CONSTRAINT "environments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "environments" ADD CONSTRAINT "environments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_knowledge_source_id_knowledge_sources_id_fk" FOREIGN KEY ("knowledge_source_id") REFERENCES "public"."knowledge_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_references" ADD CONSTRAINT "secret_references_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_references" ADD CONSTRAINT "secret_references_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "secret_references" ADD CONSTRAINT "secret_references_environment_id_environments_id_fk" FOREIGN KEY ("environment_id") REFERENCES "public"."environments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_idx" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "roles_organization_id_idx" ON "roles" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_members_team_id_user_id_idx" ON "team_members" USING btree ("team_id","user_id");--> statement-breakpoint
CREATE INDEX "team_members_user_id_idx" ON "team_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "teams_organization_id_idx" ON "teams" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "users_organization_id_idx" ON "users" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "projects_organization_id_idx" ON "projects" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "repositories_organization_id_idx" ON "repositories" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "repositories_project_id_idx" ON "repositories" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_dependencies_task_id_depends_on_task_id_idx" ON "task_dependencies" USING btree ("task_id","depends_on_task_id");--> statement-breakpoint
CREATE INDEX "task_dependencies_depends_on_task_id_idx" ON "task_dependencies" USING btree ("depends_on_task_id");--> statement-breakpoint
CREATE INDEX "tasks_organization_id_idx" ON "tasks" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "tasks_project_id_idx" ON "tasks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "tasks_assignee_id_idx" ON "tasks" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "tasks_status_idx" ON "tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "workspaces_organization_id_idx" ON "workspaces" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "workspaces_project_id_idx" ON "workspaces" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "workspaces_task_id_idx" ON "workspaces" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "agent_runs_organization_id_idx" ON "agent_runs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "agent_runs_task_id_idx" ON "agent_runs" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "agent_runs_status_idx" ON "agent_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agent_steps_agent_run_id_idx" ON "agent_steps" USING btree ("agent_run_id");--> statement-breakpoint
CREATE INDEX "agent_steps_status_idx" ON "agent_steps" USING btree ("status");--> statement-breakpoint
CREATE INDEX "agents_organization_id_idx" ON "agents" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "tool_calls_agent_step_id_idx" ON "tool_calls" USING btree ("agent_step_id");--> statement-breakpoint
CREATE INDEX "tool_calls_tool_name_idx" ON "tool_calls" USING btree ("tool_name");--> statement-breakpoint
CREATE INDEX "policies_organization_id_idx" ON "policies" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "policy_decisions_organization_id_idx" ON "policy_decisions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "policy_decisions_tool_call_id_idx" ON "policy_decisions" USING btree ("tool_call_id");--> statement-breakpoint
CREATE INDEX "ai_messages_organization_id_idx" ON "ai_messages" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ai_messages_agent_step_id_idx" ON "ai_messages" USING btree ("agent_step_id");--> statement-breakpoint
CREATE INDEX "ai_usages_organization_id_idx" ON "ai_usages" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ai_usages_agent_run_id_idx" ON "ai_usages" USING btree ("agent_run_id");--> statement-breakpoint
CREATE INDEX "code_changes_organization_id_idx" ON "code_changes" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "code_changes_workspace_id_idx" ON "code_changes" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "code_changes_agent_run_id_idx" ON "code_changes" USING btree ("agent_run_id");--> statement-breakpoint
CREATE INDEX "diffs_organization_id_idx" ON "diffs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "diffs_code_change_id_idx" ON "diffs" USING btree ("code_change_id");--> statement-breakpoint
CREATE INDEX "file_snapshots_organization_id_idx" ON "file_snapshots" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "file_snapshots_workspace_id_idx" ON "file_snapshots" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "pull_requests_organization_id_idx" ON "pull_requests" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "pull_requests_project_id_idx" ON "pull_requests" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "pull_requests_repository_id_idx" ON "pull_requests" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "pull_requests_status_idx" ON "pull_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "test_artifacts_test_run_id_idx" ON "test_artifacts" USING btree ("test_run_id");--> statement-breakpoint
CREATE INDEX "test_artifacts_test_suite_id_idx" ON "test_artifacts" USING btree ("test_suite_id");--> statement-breakpoint
CREATE INDEX "test_runs_organization_id_idx" ON "test_runs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "test_runs_project_id_idx" ON "test_runs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "test_runs_status_idx" ON "test_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "test_suites_test_run_id_idx" ON "test_suites" USING btree ("test_run_id");--> statement-breakpoint
CREATE INDEX "deployments_organization_id_idx" ON "deployments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "deployments_environment_id_idx" ON "deployments" USING btree ("environment_id");--> statement-breakpoint
CREATE INDEX "deployments_status_idx" ON "deployments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "environments_organization_id_idx" ON "environments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "environments_project_id_idx" ON "environments" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_knowledge_source_id_idx" ON "knowledge_chunks" USING btree ("knowledge_source_id");--> statement-breakpoint
CREATE INDEX "knowledge_sources_organization_id_idx" ON "knowledge_sources" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "knowledge_sources_project_id_idx" ON "knowledge_sources" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "approvals_organization_id_idx" ON "approvals" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "approvals_subject_idx" ON "approvals" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "approvals_status_idx" ON "approvals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "secret_references_organization_id_idx" ON "secret_references" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "secret_references_environment_id_idx" ON "secret_references" USING btree ("environment_id");--> statement-breakpoint
CREATE INDEX "notifications_organization_id_idx" ON "notifications" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "notifications_user_id_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_is_read_idx" ON "notifications" USING btree ("is_read");--> statement-breakpoint
CREATE INDEX "audit_logs_organization_id_idx" ON "audit_logs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "audit_logs_target_idx" ON "audit_logs" USING btree ("target_type","target_id");