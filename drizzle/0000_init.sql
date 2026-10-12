CREATE TABLE "auth_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "earnings" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"beneficiary_type" text NOT NULL,
	"beneficiary_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text,
	"venue_id" text,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"location" text NOT NULL,
	"subtitle" text DEFAULT '' NOT NULL,
	"image_url" text,
	"hero_color" text DEFAULT '#0B1A6B' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"user_id" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follows_user_id_target_type_target_id_pk" PRIMARY KEY("user_id","target_type","target_id")
);
--> statement-breakpoint
CREATE TABLE "friendships" (
	"requester_id" text NOT NULL,
	"addressee_id" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "friendships_requester_id_addressee_id_pk" PRIMARY KEY("requester_id","addressee_id")
);
--> statement-breakpoint
CREATE TABLE "ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"note" text NOT NULL,
	"request_id" text,
	"payment_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text,
	"mime" text NOT NULL,
	"data" "bytea" NOT NULL,
	"bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_accounts" (
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_accounts_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_ref" text,
	"amount_cents" integer NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "performance_likes" (
	"performance_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "performance_likes_performance_id_user_id_pk" PRIMARY KEY("performance_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "performances" (
	"id" text PRIMARY KEY NOT NULL,
	"performer_id" text NOT NULL,
	"venue_id" text NOT NULL,
	"event_id" text,
	"stage_id" text,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"went_live_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"basis" text DEFAULT 'Once off' NOT NULL,
	"crowd_estimate" integer DEFAULT 0 NOT NULL,
	"image_url" text,
	"caption" text,
	"setlist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"set_cursor" integer DEFAULT 0 NOT NULL,
	"now_playing" jsonb,
	"reposts" integer DEFAULT 0 NOT NULL,
	"likes_base" integer DEFAULT 0 NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "performers" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"genres" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"image_url" text,
	"bio" text,
	"controls" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "performers_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "post_likes" (
	"post_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_likes_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" text PRIMARY KEY NOT NULL,
	"author_id" text NOT NULL,
	"kind" text NOT NULL,
	"performance_id" text,
	"text" text DEFAULT '' NOT NULL,
	"caption" text,
	"image_url" text,
	"now_playing" text,
	"to_user_id" text,
	"label" text,
	"likes_base" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "request_reactions" (
	"request_id" text NOT NULL,
	"user_id" text NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "request_reactions_request_id_user_id_emoji_pk" PRIMARY KEY("request_id","user_id","emoji")
);
--> statement-breakpoint
CREATE TABLE "request_votes" (
	"request_id" text NOT NULL,
	"user_id" text NOT NULL,
	"value" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "request_votes_request_id_user_id_pk" PRIMARY KEY("request_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"id" text PRIMARY KEY NOT NULL,
	"performance_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"track" jsonb,
	"message" text,
	"price_cents" integer NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"played_at" timestamp with time zone,
	"base_up" integer DEFAULT 0 NOT NULL,
	"base_down" integer DEFAULT 0 NOT NULL,
	"reaction_base" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"user_agent" text,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stages" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"name" text NOT NULL,
	"image_url" text,
	"genre" text,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"user_name" text NOT NULL,
	"user_name_key" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"role" text NOT NULL,
	"avatar_url" text,
	"ring" text,
	"wallet_cents" integer DEFAULT 0 NOT NULL,
	"email_verified_at" timestamp with time zone,
	"lat" double precision,
	"lng" double precision,
	"status_text" text,
	"share_location" boolean DEFAULT false NOT NULL,
	"location_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "venues" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"city" text NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"image_url" text,
	"logo_style" text DEFAULT 'wide' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"chat_label" text DEFAULT 'CLUB CHAT' NOT NULL,
	"management_label" text DEFAULT 'Management Team' NOT NULL,
	"capacity" integer DEFAULT 0 NOT NULL,
	"live_capacity" integer DEFAULT 0 NOT NULL,
	"avg_week" integer DEFAULT 0 NOT NULL,
	"avg_month" integer DEFAULT 0 NOT NULL,
	"wait_minutes" integer,
	"safety_phone" text,
	"artist_share_pct" integer DEFAULT 50 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "earnings" ADD CONSTRAINT "earnings_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendships" ADD CONSTRAINT "friendships_addressee_id_users_id_fk" FOREIGN KEY ("addressee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger" ADD CONSTRAINT "ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_likes" ADD CONSTRAINT "performance_likes_performance_id_performances_id_fk" FOREIGN KEY ("performance_id") REFERENCES "public"."performances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_likes" ADD CONSTRAINT "performance_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performances" ADD CONSTRAINT "performances_performer_id_performers_id_fk" FOREIGN KEY ("performer_id") REFERENCES "public"."performers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performances" ADD CONSTRAINT "performances_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performances" ADD CONSTRAINT "performances_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performances" ADD CONSTRAINT "performances_stage_id_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performances" ADD CONSTRAINT "performances_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performers" ADD CONSTRAINT "performers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_performance_id_performances_id_fk" FOREIGN KEY ("performance_id") REFERENCES "public"."performances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_reactions" ADD CONSTRAINT "request_reactions_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_reactions" ADD CONSTRAINT "request_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_votes" ADD CONSTRAINT "request_votes_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_votes" ADD CONSTRAINT "request_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_performance_id_performances_id_fk" FOREIGN KEY ("performance_id") REFERENCES "public"."performances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stages" ADD CONSTRAINT "stages_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venues" ADD CONSTRAINT "venues_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "earnings_beneficiary_idx" ON "earnings" USING btree ("beneficiary_type","beneficiary_id");--> statement-breakpoint
CREATE INDEX "events_starts_idx" ON "events" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "friendships_addressee_idx" ON "friendships" USING btree ("addressee_id");--> statement-breakpoint
CREATE INDEX "ledger_user_idx" ON "ledger" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "payments_user_idx" ON "payments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "payments_ref_idx" ON "payments" USING btree ("provider_ref");--> statement-breakpoint
CREATE INDEX "performances_performer_idx" ON "performances" USING btree ("performer_id");--> statement-breakpoint
CREATE INDEX "performances_venue_idx" ON "performances" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "performances_event_idx" ON "performances" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "posts_performance_idx" ON "posts" USING btree ("performance_id");--> statement-breakpoint
CREATE INDEX "posts_created_idx" ON "posts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "requests_performance_idx" ON "requests" USING btree ("performance_id");--> statement-breakpoint
CREATE INDEX "requests_user_idx" ON "requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "requests_created_idx" ON "requests" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_user_name_key_idx" ON "users" USING btree ("user_name_key");--> statement-breakpoint
CREATE INDEX "venues_owner_idx" ON "venues" USING btree ("owner_id");