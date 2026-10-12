CREATE TABLE "aux_passes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"venue_id" text,
	"kind" text NOT NULL,
	"price_cents" integer DEFAULT 0 NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "aux_peers" (
	"id" text PRIMARY KEY NOT NULL,
	"stream_id" text NOT NULL,
	"user_id" text NOT NULL,
	"offer" text NOT NULL,
	"answer" text,
	"status" text DEFAULT 'WAITING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "aux_streams" (
	"id" text PRIMARY KEY NOT NULL,
	"venue_id" text NOT NULL,
	"zone" text DEFAULT 'Main floor' NOT NULL,
	"started_by_id" text,
	"status" text DEFAULT 'LIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "music_connections" (
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"external_id" text,
	"display_name" text,
	"access_token_enc" text,
	"refresh_token_enc" text,
	"expires_at" timestamp with time zone,
	"scope" text,
	"last_import_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "music_connections_user_id_provider_pk" PRIMARY KEY("user_id","provider")
);
--> statement-breakpoint
CREATE TABLE "native_push_tokens" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"performance_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"endpoint" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"live_performance_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "track_links" (
	"key" text PRIMARY KEY NOT NULL,
	"spotify_uri" text,
	"youtube_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "venue_checkins" (
	"user_id" text NOT NULL,
	"venue_id" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "venue_checkins_user_id_venue_id_pk" PRIMARY KEY("user_id","venue_id")
);
--> statement-breakpoint
ALTER TABLE "performances" ADD COLUMN "playback" jsonb;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "external_queued_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "external_ref" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "spend_cap_cents" integer;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "aux_in_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "aux_in_day_pass_cents" integer DEFAULT 3000 NOT NULL;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "aux_in_member_code" text;--> statement-breakpoint
ALTER TABLE "aux_passes" ADD CONSTRAINT "aux_passes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aux_passes" ADD CONSTRAINT "aux_passes_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aux_peers" ADD CONSTRAINT "aux_peers_stream_id_aux_streams_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."aux_streams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aux_peers" ADD CONSTRAINT "aux_peers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aux_streams" ADD CONSTRAINT "aux_streams_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aux_streams" ADD CONSTRAINT "aux_streams_started_by_id_users_id_fk" FOREIGN KEY ("started_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "music_connections" ADD CONSTRAINT "music_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "native_push_tokens" ADD CONSTRAINT "native_push_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "native_push_tokens" ADD CONSTRAINT "native_push_tokens_performance_id_performances_id_fk" FOREIGN KEY ("performance_id") REFERENCES "public"."performances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_live_performance_id_performances_id_fk" FOREIGN KEY ("live_performance_id") REFERENCES "public"."performances"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_checkins" ADD CONSTRAINT "venue_checkins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_checkins" ADD CONSTRAINT "venue_checkins_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "aux_passes_user_idx" ON "aux_passes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "aux_passes_venue_idx" ON "aux_passes" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "aux_peers_stream_idx" ON "aux_peers" USING btree ("stream_id");--> statement-breakpoint
CREATE INDEX "aux_streams_venue_idx" ON "aux_streams" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "native_push_user_idx" ON "native_push_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "native_push_perf_idx" ON "native_push_tokens" USING btree ("performance_id");--> statement-breakpoint
CREATE INDEX "push_user_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "push_live_idx" ON "push_subscriptions" USING btree ("live_performance_id");