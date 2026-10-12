CREATE TABLE "set_plays" (
	"id" text PRIMARY KEY NOT NULL,
	"performance_id" text NOT NULL,
	"track" jsonb NOT NULL,
	"request_id" text,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "set_plays" ADD CONSTRAINT "set_plays_performance_id_performances_id_fk" FOREIGN KEY ("performance_id") REFERENCES "public"."performances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "set_plays_perf_idx" ON "set_plays" USING btree ("performance_id","started_at");