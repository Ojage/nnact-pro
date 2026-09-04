DO $$ BEGIN
 CREATE TYPE "public"."equipment_component_kind" AS ENUM('generic', 'actuator', 'sensor', 'pcb', 'connector', 'wiring', 'harness', 'valve', 'motor', 'compressor', 'pump', 'heater', 'fan', 'belt', 'seal', 'filter');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE "equipment_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"subcategory" text,
	"product_family" text,
	"description" text,
	"template" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "equipment_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"subsystem_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"kind" "equipment_component_kind" DEFAULT 'generic' NOT NULL,
	"reference" text,
	"manufacturer_part_number" text,
	"description" text,
	"ordinal" integer DEFAULT 0 NOT NULL,
	"created_by_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "equipment_connectors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"component_id" uuid NOT NULL,
	"board" text,
	"label" text NOT NULL,
	"description" text,
	"ordinal" integer DEFAULT 0 NOT NULL,
	"created_by_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "equipment_error_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"equipment_model_id" uuid NOT NULL,
	"system_id" uuid,
	"code" text NOT NULL,
	"normalized_code" text NOT NULL,
	"meaning" text,
	"description" text,
	"preconditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"likely_causes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"corrective_actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"severity" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence_status" "knowledge_confidence" DEFAULT 'unverified' NOT NULL,
	"verification_status" "knowledge_verification_status" DEFAULT 'field_note' NOT NULL,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_by_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "equipment_subsystems" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"system_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"reference" text,
	"description" text,
	"ordinal" integer DEFAULT 0 NOT NULL,
	"created_by_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "equipment_systems" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"reference" text,
	"description" text,
	"ordinal" integer DEFAULT 0 NOT NULL,
	"created_by_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "equipment_terminals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"connector_id" uuid NOT NULL,
	"pin" integer NOT NULL,
	"signal" text,
	"wire_color" text,
	"description" text,
	"ordinal" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"equipment_model_id" uuid,
	"category_id" uuid,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"kind" text DEFAULT 'article' NOT NULL,
	"body" text NOT NULL,
	"summary" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"verification_status" "knowledge_verification_status" DEFAULT 'field_note' NOT NULL,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_by_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_edges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid NOT NULL,
	"relationship" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_template_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"section_key" text NOT NULL,
	"label" text NOT NULL,
	"group" text,
	"kind" text DEFAULT 'content' NOT NULL,
	"ordinal" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manufacturers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"country" text,
	"notes" text,
	"created_by_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "measurement_points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"component_id" uuid,
	"connector_id" uuid,
	"name" text NOT NULL,
	"parameter" text NOT NULL,
	"unit" text,
	"expected_min" double precision,
	"expected_max" double precision,
	"expected_exact" double precision,
	"measurement_conditions" text,
	"instrument_required" text,
	"safety_notes" text,
	"reference" text,
	"created_by_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operating_sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"equipment_model_id" uuid NOT NULL,
	"system_id" uuid,
	"name" text NOT NULL,
	"phase" text,
	"description" text,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ordinal" integer DEFAULT 0 NOT NULL,
	"created_by_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_modes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"equipment_model_id" uuid NOT NULL,
	"name" text NOT NULL,
	"entry_procedure" text,
	"parameters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"description" text,
	"safety_warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "equipment_models" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "equipment_models" ADD COLUMN "manufacturer_id" uuid;--> statement-breakpoint
ALTER TABLE "equipment_categories" ADD CONSTRAINT "equipment_categories_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_categories" ADD CONSTRAINT "equipment_categories_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_components" ADD CONSTRAINT "equipment_components_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_components" ADD CONSTRAINT "equipment_components_subsystem_id_equipment_subsystems_id_fk" FOREIGN KEY ("subsystem_id") REFERENCES "public"."equipment_subsystems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_components" ADD CONSTRAINT "equipment_components_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_connectors" ADD CONSTRAINT "equipment_connectors_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_connectors" ADD CONSTRAINT "equipment_connectors_component_id_equipment_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."equipment_components"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_connectors" ADD CONSTRAINT "equipment_connectors_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_error_codes" ADD CONSTRAINT "equipment_error_codes_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_error_codes" ADD CONSTRAINT "equipment_error_codes_equipment_model_id_equipment_models_id_fk" FOREIGN KEY ("equipment_model_id") REFERENCES "public"."equipment_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_error_codes" ADD CONSTRAINT "equipment_error_codes_system_id_equipment_systems_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."equipment_systems"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_error_codes" ADD CONSTRAINT "equipment_error_codes_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_error_codes" ADD CONSTRAINT "equipment_error_codes_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_subsystems" ADD CONSTRAINT "equipment_subsystems_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_subsystems" ADD CONSTRAINT "equipment_subsystems_system_id_equipment_systems_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."equipment_systems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_subsystems" ADD CONSTRAINT "equipment_subsystems_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_systems" ADD CONSTRAINT "equipment_systems_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_systems" ADD CONSTRAINT "equipment_systems_category_id_equipment_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."equipment_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_systems" ADD CONSTRAINT "equipment_systems_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_terminals" ADD CONSTRAINT "equipment_terminals_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_terminals" ADD CONSTRAINT "equipment_terminals_connector_id_equipment_connectors_id_fk" FOREIGN KEY ("connector_id") REFERENCES "public"."equipment_connectors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_equipment_model_id_equipment_models_id_fk" FOREIGN KEY ("equipment_model_id") REFERENCES "public"."equipment_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_category_id_equipment_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."equipment_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_edges" ADD CONSTRAINT "knowledge_edges_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_edges" ADD CONSTRAINT "knowledge_edges_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_template_sections" ADD CONSTRAINT "knowledge_template_sections_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_template_sections" ADD CONSTRAINT "knowledge_template_sections_category_id_equipment_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."equipment_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manufacturers" ADD CONSTRAINT "manufacturers_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manufacturers" ADD CONSTRAINT "manufacturers_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement_points" ADD CONSTRAINT "measurement_points_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement_points" ADD CONSTRAINT "measurement_points_component_id_equipment_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."equipment_components"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement_points" ADD CONSTRAINT "measurement_points_connector_id_equipment_connectors_id_fk" FOREIGN KEY ("connector_id") REFERENCES "public"."equipment_connectors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurement_points" ADD CONSTRAINT "measurement_points_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operating_sequences" ADD CONSTRAINT "operating_sequences_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operating_sequences" ADD CONSTRAINT "operating_sequences_equipment_model_id_equipment_models_id_fk" FOREIGN KEY ("equipment_model_id") REFERENCES "public"."equipment_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operating_sequences" ADD CONSTRAINT "operating_sequences_system_id_equipment_systems_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."equipment_systems"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operating_sequences" ADD CONSTRAINT "operating_sequences_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_modes" ADD CONSTRAINT "service_modes_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_modes" ADD CONSTRAINT "service_modes_equipment_model_id_equipment_models_id_fk" FOREIGN KEY ("equipment_model_id") REFERENCES "public"."equipment_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_modes" ADD CONSTRAINT "service_modes_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "equipment_categories_org_slug_idx" ON "equipment_categories" USING btree ("org_id","slug");--> statement-breakpoint
CREATE INDEX "equipment_categories_org_name_idx" ON "equipment_categories" USING btree ("org_id","name");--> statement-breakpoint
CREATE INDEX "equipment_components_org_subsystem_ordinal_idx" ON "equipment_components" USING btree ("org_id","subsystem_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "equipment_components_subsystem_slug_idx" ON "equipment_components" USING btree ("subsystem_id","slug");--> statement-breakpoint
CREATE INDEX "equipment_components_part_number_idx" ON "equipment_components" USING btree ("org_id","manufacturer_part_number");--> statement-breakpoint
CREATE INDEX "equipment_connectors_org_component_ordinal_idx" ON "equipment_connectors" USING btree ("org_id","component_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "equipment_connectors_component_label_idx" ON "equipment_connectors" USING btree ("component_id","label");--> statement-breakpoint
CREATE UNIQUE INDEX "equipment_error_codes_org_model_code_idx" ON "equipment_error_codes" USING btree ("org_id","equipment_model_id","normalized_code");--> statement-breakpoint
CREATE INDEX "equipment_error_codes_org_normalized_idx" ON "equipment_error_codes" USING btree ("org_id","normalized_code");--> statement-breakpoint
CREATE INDEX "equipment_subsystems_org_system_ordinal_idx" ON "equipment_subsystems" USING btree ("org_id","system_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "equipment_subsystems_system_slug_idx" ON "equipment_subsystems" USING btree ("system_id","slug");--> statement-breakpoint
CREATE INDEX "equipment_systems_org_category_ordinal_idx" ON "equipment_systems" USING btree ("org_id","category_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "equipment_systems_category_slug_idx" ON "equipment_systems" USING btree ("category_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "equipment_terminals_connector_pin_idx" ON "equipment_terminals" USING btree ("connector_id","pin");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_articles_org_model_slug_idx" ON "knowledge_articles" USING btree ("org_id","equipment_model_id","slug");--> statement-breakpoint
CREATE INDEX "knowledge_articles_org_category_idx" ON "knowledge_articles" USING btree ("org_id","category_id");--> statement-breakpoint
CREATE INDEX "knowledge_edges_org_source_idx" ON "knowledge_edges" USING btree ("org_id","source_type","source_id");--> statement-breakpoint
CREATE INDEX "knowledge_edges_org_target_idx" ON "knowledge_edges" USING btree ("org_id","target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_edges_unique_idx" ON "knowledge_edges" USING btree ("source_type","source_id","relationship","target_type","target_id");--> statement-breakpoint
CREATE INDEX "knowledge_template_sections_org_category_ordinal_idx" ON "knowledge_template_sections" USING btree ("org_id","category_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_template_sections_category_section_idx" ON "knowledge_template_sections" USING btree ("category_id","section_key");--> statement-breakpoint
CREATE UNIQUE INDEX "manufacturers_org_slug_idx" ON "manufacturers" USING btree ("org_id","slug");--> statement-breakpoint
CREATE INDEX "measurement_points_org_component_idx" ON "measurement_points" USING btree ("org_id","component_id");--> statement-breakpoint
CREATE INDEX "measurement_points_org_connector_idx" ON "measurement_points" USING btree ("org_id","connector_id");--> statement-breakpoint
CREATE INDEX "operating_sequences_org_model_ordinal_idx" ON "operating_sequences" USING btree ("org_id","equipment_model_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "service_modes_org_model_name_idx" ON "service_modes" USING btree ("org_id","equipment_model_id","name");--> statement-breakpoint
ALTER TABLE "equipment_models" ADD CONSTRAINT "equipment_models_category_id_equipment_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."equipment_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment_models" ADD CONSTRAINT "equipment_models_manufacturer_id_manufacturers_id_fk" FOREIGN KEY ("manufacturer_id") REFERENCES "public"."manufacturers"("id") ON DELETE set null ON UPDATE no action;