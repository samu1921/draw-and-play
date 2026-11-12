ALTER TABLE "matches" ADD COLUMN "partner_a" uuid;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "partner_b" uuid;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_partner_a_entries_id_fk" FOREIGN KEY ("partner_a") REFERENCES "public"."entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_partner_b_entries_id_fk" FOREIGN KEY ("partner_b") REFERENCES "public"."entries"("id") ON DELETE set null ON UPDATE no action;