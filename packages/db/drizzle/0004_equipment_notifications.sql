-- Equipment tracking + in-app notifications
-- ponytail: equipment has no property_id. Ceiling: multi-property customers.
-- Upgrade: add properties table and link equipment to it.

CREATE TABLE IF NOT EXISTS "equipment" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  "customer_id" uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  "type" text NOT NULL,
  "make" text,
  "model" text,
  "serial_number" text,
  "install_date" timestamp with time zone,
  "warranty_expiry" timestamp with time zone,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX equipment_customer_idx ON equipment(org_id, customer_id);

CREATE TABLE IF NOT EXISTS "notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "org_id" uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "type" text NOT NULL,
  "title" text NOT NULL,
  "body" text,
  "link" text,
  "read" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX notif_user_idx ON notifications(org_id, user_id, created_at DESC);
CREATE INDEX notif_unread_idx ON notifications(org_id, user_id, read);
