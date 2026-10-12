CREATE TABLE "favorites" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"track" jsonb,
	"performance_id" text,
	"source" text DEFAULT 'AUXED' NOT NULL,
	"from_user_id" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_members" (
	"performance_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'GUEST' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_members_performance_id_user_id_pk" PRIMARY KEY("performance_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "stories" (
	"id" text PRIMARY KEY NOT NULL,
	"author_id" text NOT NULL,
	"performer_id" text,
	"venue_id" text,
	"kind" text NOT NULL,
	"performance_id" text,
	"request_id" text,
	"image_url" text,
	"text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "story_views" (
	"story_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "story_views_story_id_user_id_pk" PRIMARY KEY("story_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "performances" ALTER COLUMN "performer_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "performances" ALTER COLUMN "venue_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "performances" ADD COLUMN "kind" text DEFAULT 'SET' NOT NULL;--> statement-breakpoint
ALTER TABLE "performances" ADD COLUMN "host_user_id" text;--> statement-breakpoint
ALTER TABLE "performances" ADD COLUMN "visibility" text DEFAULT 'PUBLIC' NOT NULL;--> statement-breakpoint
ALTER TABLE "performances" ADD COLUMN "join_code" text;--> statement-breakpoint
ALTER TABLE "performances" ADD COLUMN "home_settings" jsonb;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "attachment" jsonb;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_performance_id_performances_id_fk" FOREIGN KEY ("performance_id") REFERENCES "public"."performances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_members" ADD CONSTRAINT "session_members_performance_id_performances_id_fk" FOREIGN KEY ("performance_id") REFERENCES "public"."performances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_members" ADD CONSTRAINT "session_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_performer_id_performers_id_fk" FOREIGN KEY ("performer_id") REFERENCES "public"."performers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_performance_id_performances_id_fk" FOREIGN KEY ("performance_id") REFERENCES "public"."performances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_views" ADD CONSTRAINT "story_views_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_views" ADD CONSTRAINT "story_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "favorites_user_idx" ON "favorites" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_members_user_idx" ON "session_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stories_expires_idx" ON "stories" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "stories_author_idx" ON "stories" USING btree ("author_id");--> statement-breakpoint
ALTER TABLE "performances" ADD CONSTRAINT "performances_host_user_id_users_id_fk" FOREIGN KEY ("host_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "performances_host_idx" ON "performances" USING btree ("host_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "performances_join_code_idx" ON "performances" USING btree ("join_code");