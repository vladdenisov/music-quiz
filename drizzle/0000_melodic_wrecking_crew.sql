CREATE TYPE "public"."game_status" AS ENUM('pending', 'active', 'ended');--> statement-breakpoint
CREATE TYPE "public"."question_type" AS ENUM('guess_song', 'guess_artist');--> statement-breakpoint
CREATE TYPE "public"."room_status" AS ENUM('lobby', 'in_game', 'ended');--> statement-breakpoint
CREATE TYPE "public"."round_status" AS ENUM('pending', 'active', 'ended');--> statement-breakpoint
CREATE TABLE "answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"selected_option_id" text NOT NULL,
	"answer" text NOT NULL,
	"is_correct" boolean NOT NULL,
	"score" integer NOT NULL,
	"answered_at" timestamp with time zone NOT NULL,
	"client_answered_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"status" "game_status" DEFAULT 'pending' NOT NULL,
	"settings" jsonb NOT NULL,
	"current_round_number" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nickname" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rejected_track_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_track_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_track_id" text NOT NULL,
	"reason" text NOT NULL,
	"score" integer NOT NULL,
	"metadata" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_players" (
	"room_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"is_connected" boolean DEFAULT false NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	CONSTRAINT "room_players_room_id_player_id_pk" PRIMARY KEY("room_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"host_player_id" uuid NOT NULL,
	"status" "room_status" DEFAULT 'lobby' NOT NULL,
	"settings" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"track_id" uuid NOT NULL,
	"round_number" integer NOT NULL,
	"question_type" "question_type" NOT NULL,
	"question_text" text NOT NULL,
	"correct_option_id" text NOT NULL,
	"correct_answer" text NOT NULL,
	"options" jsonb NOT NULL,
	"round_started_at" timestamp with time zone,
	"round_ends_at" timestamp with time zone,
	"round_duration_sec" integer NOT NULL,
	"status" "round_status" DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "track_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_track_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_track_id" text NOT NULL,
	"score" integer NOT NULL,
	"preview_url" text NOT NULL,
	"metadata" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"source_track_id" text NOT NULL,
	"isrc" text,
	"artist" text NOT NULL,
	"title" text NOT NULL,
	"album" text,
	"duration_ms" integer,
	"preview_url" text NOT NULL,
	"preview_provider" text NOT NULL,
	"artwork_url" text,
	"genre" text,
	"release_year" integer,
	"popularity" integer,
	"match_score" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answers" ADD CONSTRAINT "answers_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_players" ADD CONSTRAINT "room_players_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_players" ADD CONSTRAINT "room_players_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_host_player_id_players_id_fk" FOREIGN KEY ("host_player_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "answers_round_player_unique" ON "answers" USING btree ("round_id","player_id");--> statement-breakpoint
CREATE INDEX "answers_round_idx" ON "answers" USING btree ("round_id");--> statement-breakpoint
CREATE INDEX "games_room_idx" ON "games" USING btree ("room_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rejected_track_matches_provider_unique" ON "rejected_track_matches" USING btree ("source_track_id","provider","provider_track_id");--> statement-breakpoint
CREATE INDEX "room_players_player_idx" ON "room_players" USING btree ("player_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rooms_code_unique" ON "rooms" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "rounds_game_round_unique" ON "rounds" USING btree ("game_id","round_number");--> statement-breakpoint
CREATE INDEX "rounds_game_status_idx" ON "rounds" USING btree ("game_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "track_matches_provider_unique" ON "track_matches" USING btree ("source_track_id","provider","provider_track_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tracks_source_track_unique" ON "tracks" USING btree ("source","source_track_id");--> statement-breakpoint
CREATE INDEX "tracks_isrc_idx" ON "tracks" USING btree ("isrc");--> statement-breakpoint
CREATE INDEX "tracks_context_idx" ON "tracks" USING btree ("genre","release_year","popularity");