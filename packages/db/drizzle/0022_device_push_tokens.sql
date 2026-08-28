-- Firebase Cloud Messaging device tokens for push + live field updates
CREATE TABLE IF NOT EXISTS "device_push_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "platform" text NOT NULL,
  "provider" text NOT NULL DEFAULT 'fcm',
  "token" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS device_push_tokens_token_idx ON device_push_tokens(token);
CREATE INDEX IF NOT EXISTS device_push_tokens_user_idx ON device_push_tokens(org_id, user_id);
