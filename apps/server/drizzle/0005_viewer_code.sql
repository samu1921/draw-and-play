CREATE TABLE "viewer_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"code_version" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "viewer_code" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "viewer_code_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "viewer_sessions" ADD CONSTRAINT "viewer_sessions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "viewer_sessions_event_idx" ON "viewer_sessions" USING btree ("event_id");