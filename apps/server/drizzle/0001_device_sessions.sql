CREATE TABLE "device_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"pin_version" integer NOT NULL,
	"label" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "pin_hash" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "pin_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "device_sessions" ADD CONSTRAINT "device_sessions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "device_sessions_event_idx" ON "device_sessions" USING btree ("event_id");