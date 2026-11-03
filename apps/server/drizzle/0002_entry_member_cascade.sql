ALTER TABLE "entry_members" DROP CONSTRAINT "entry_members_person_id_persons_id_fk";
--> statement-breakpoint
ALTER TABLE "entry_members" ADD CONSTRAINT "entry_members_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;