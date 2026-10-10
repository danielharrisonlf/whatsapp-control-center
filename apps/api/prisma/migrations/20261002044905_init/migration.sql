-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'DEVELOPER', 'VIEWER');

-- CreateEnum
CREATE TYPE "ConnectionKind" AS ENUM ('EMBEDDED_SIGNUP', 'MANUAL');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('ACTIVE', 'ERROR', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('OUTBOUND', 'INBOUND');

-- CreateEnum
CREATE TYPE "WebhookProcessingStatus" AS ENUM ('PENDING', 'PROCESSED', 'IGNORED', 'FAILED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ApiLogDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "MediaOrigin" AS ENUM ('UPLOADED', 'RECEIVED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "previous_token_hash" TEXT,
    "user_agent" TEXT,
    "ip_address" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "invited_by_id" UUID,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_connections" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ConnectionKind" NOT NULL,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "meta_app_id" TEXT NOT NULL,
    "app_secret_ciphertext" TEXT,
    "access_token_ciphertext" TEXT NOT NULL,
    "access_token_preview" TEXT NOT NULL,
    "token_type" TEXT,
    "token_expires_at" TIMESTAMP(3),
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "granular_scopes" JSONB,
    "last_checked_at" TIMESTAMP(3),
    "last_error" JSONB,
    "last_synced_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meta_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meta_businesses" (
    "id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "meta_business_id" TEXT NOT NULL,
    "name" TEXT,
    "verification_status" TEXT,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meta_businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_business_accounts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "business_id" UUID,
    "meta_waba_id" TEXT NOT NULL,
    "name" TEXT,
    "display_label" TEXT,
    "timezone_id" TEXT,
    "currency" TEXT,
    "message_template_namespace" TEXT,
    "account_review_status" TEXT,
    "business_verification_status" TEXT,
    "owner_business_name" TEXT,
    "owner_business_id" TEXT,
    "app_subscribed" BOOLEAN,
    "subscribed_apps" JSONB,
    "raw" JSONB,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_business_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "phone_numbers" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "waba_id" UUID NOT NULL,
    "meta_phone_number_id" TEXT NOT NULL,
    "display_phone_number" TEXT,
    "verified_name" TEXT,
    "display_label" TEXT,
    "status" TEXT,
    "code_verification_status" TEXT,
    "name_status" TEXT,
    "quality_rating" TEXT,
    "platform_type" TEXT,
    "throughput_level" TEXT,
    "messaging_limit_tier" TEXT,
    "is_official_business_account" BOOLEAN,
    "last_onboarded_time" TIMESTAMP(3),
    "raw" JSONB,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "phone_numbers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_profiles" (
    "id" UUID NOT NULL,
    "phone_number_id" UUID NOT NULL,
    "about" TEXT,
    "address" TEXT,
    "description" TEXT,
    "email" TEXT,
    "vertical" TEXT,
    "websites" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "profile_picture_url" TEXT,
    "last_synced_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_templates" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "waba_id" UUID NOT NULL,
    "meta_template_id" TEXT,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "previous_category" TEXT,
    "parameter_format" TEXT,
    "status" TEXT NOT NULL,
    "components" JSONB NOT NULL,
    "quality_score" TEXT,
    "rejected_reason" TEXT,
    "sub_category" TEXT,
    "last_synced_at" TIMESTAMP(3),
    "remote_deleted_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_flows" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "waba_id" UUID NOT NULL,
    "meta_flow_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "json_version" TEXT,
    "data_api_version" TEXT,
    "endpoint_uri" TEXT,
    "validation_errors" JSONB,
    "preview_url" TEXT,
    "preview_expires_at" TIMESTAMP(3),
    "flow_json" JSONB,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_flows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_configs" (
    "id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "endpoint_key" TEXT NOT NULL,
    "verify_token_ciphertext" TEXT NOT NULL,
    "verify_token_preview" TEXT NOT NULL,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "endpoint" TEXT NOT NULL,
    "object" TEXT,
    "field" TEXT,
    "event_type" TEXT,
    "meta_waba_id" TEXT,
    "meta_phone_number_id" TEXT,
    "signature_valid" BOOLEAN NOT NULL,
    "processing_status" "WebhookProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "response_status" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "headers" JSONB NOT NULL,
    "processing_log" JSONB NOT NULL DEFAULT '[]',
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "phone_number_id" UUID NOT NULL,
    "wa_id" TEXT NOT NULL,
    "profile_name" TEXT,
    "last_message_at" TIMESTAMP(3),
    "last_inbound_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "phone_number_id" UUID NOT NULL,
    "contact_id" UUID,
    "webhook_event_id" UUID,
    "wamid" TEXT,
    "direction" "MessageDirection" NOT NULL,
    "sender" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "error" JSONB,
    "pricing" JSONB,
    "conversation" JSONB,
    "sent_by_id" UUID,
    "meta_timestamp" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_status_events" (
    "id" UUID NOT NULL,
    "message_id" UUID,
    "wamid" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "recipient_id" TEXT,
    "errors" JSONB,
    "pricing" JSONB,
    "conversation" JSONB,
    "meta_timestamp" TIMESTAMP(3) NOT NULL,
    "webhook_event_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_status_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "phone_number_id" UUID NOT NULL,
    "meta_media_id" TEXT NOT NULL,
    "origin" "MediaOrigin" NOT NULL,
    "mime_type" TEXT,
    "file_size" INTEGER,
    "sha256" TEXT,
    "file_name" TEXT,
    "deleted_at" TIMESTAMP(3),
    "uploaded_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_request_logs" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "request_id" TEXT NOT NULL,
    "direction" "ApiLogDirection" NOT NULL,
    "method" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status_code" INTEGER,
    "duration_ms" INTEGER NOT NULL,
    "request_body" JSONB,
    "response_body" JSONB,
    "meta_trace_id" TEXT,
    "error_code" INTEGER,
    "actor_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_request_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resource_id" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refresh_token_hash_key" ON "sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_previous_token_hash_idx" ON "sessions"("previous_token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "memberships_organization_id_idx" ON "memberships"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_user_id_organization_id_key" ON "memberships"("user_id", "organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");

-- CreateIndex
CREATE INDEX "invitations_organization_id_idx" ON "invitations"("organization_id");

-- CreateIndex
CREATE INDEX "meta_connections_organization_id_idx" ON "meta_connections"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "meta_businesses_connection_id_meta_business_id_key" ON "meta_businesses"("connection_id", "meta_business_id");

-- CreateIndex
CREATE INDEX "whatsapp_business_accounts_connection_id_idx" ON "whatsapp_business_accounts"("connection_id");

-- CreateIndex
CREATE INDEX "whatsapp_business_accounts_meta_waba_id_idx" ON "whatsapp_business_accounts"("meta_waba_id");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_business_accounts_organization_id_meta_waba_id_key" ON "whatsapp_business_accounts"("organization_id", "meta_waba_id");

-- CreateIndex
CREATE INDEX "phone_numbers_waba_id_idx" ON "phone_numbers"("waba_id");

-- CreateIndex
CREATE INDEX "phone_numbers_meta_phone_number_id_idx" ON "phone_numbers"("meta_phone_number_id");

-- CreateIndex
CREATE UNIQUE INDEX "phone_numbers_organization_id_meta_phone_number_id_key" ON "phone_numbers"("organization_id", "meta_phone_number_id");

-- CreateIndex
CREATE UNIQUE INDEX "business_profiles_phone_number_id_key" ON "business_profiles"("phone_number_id");

-- CreateIndex
CREATE INDEX "message_templates_organization_id_status_idx" ON "message_templates"("organization_id", "status");

-- CreateIndex
CREATE INDEX "message_templates_meta_template_id_idx" ON "message_templates"("meta_template_id");

-- CreateIndex
CREATE UNIQUE INDEX "message_templates_waba_id_name_language_key" ON "message_templates"("waba_id", "name", "language");

-- CreateIndex
CREATE INDEX "whatsapp_flows_organization_id_idx" ON "whatsapp_flows"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_flows_waba_id_meta_flow_id_key" ON "whatsapp_flows"("waba_id", "meta_flow_id");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_configs_connection_id_key" ON "webhook_configs"("connection_id");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_configs_endpoint_key_key" ON "webhook_configs"("endpoint_key");

-- CreateIndex
CREATE INDEX "webhook_events_organization_id_received_at_idx" ON "webhook_events"("organization_id", "received_at" DESC);

-- CreateIndex
CREATE INDEX "webhook_events_organization_id_field_idx" ON "webhook_events"("organization_id", "field");

-- CreateIndex
CREATE INDEX "webhook_events_meta_phone_number_id_idx" ON "webhook_events"("meta_phone_number_id");

-- CreateIndex
CREATE INDEX "contacts_organization_id_last_message_at_idx" ON "contacts"("organization_id", "last_message_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "contacts_phone_number_id_wa_id_key" ON "contacts"("phone_number_id", "wa_id");

-- CreateIndex
CREATE UNIQUE INDEX "messages_wamid_key" ON "messages"("wamid");

-- CreateIndex
CREATE INDEX "messages_organization_id_created_at_idx" ON "messages"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "messages_contact_id_created_at_idx" ON "messages"("contact_id", "created_at");

-- CreateIndex
CREATE INDEX "messages_phone_number_id_created_at_idx" ON "messages"("phone_number_id", "created_at");

-- CreateIndex
CREATE INDEX "message_status_events_message_id_idx" ON "message_status_events"("message_id");

-- CreateIndex
CREATE UNIQUE INDEX "message_status_events_wamid_status_meta_timestamp_key" ON "message_status_events"("wamid", "status", "meta_timestamp");

-- CreateIndex
CREATE INDEX "media_organization_id_created_at_idx" ON "media"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "media_phone_number_id_meta_media_id_key" ON "media"("phone_number_id", "meta_media_id");

-- CreateIndex
CREATE INDEX "api_request_logs_organization_id_created_at_idx" ON "api_request_logs"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "api_request_logs_request_id_idx" ON "api_request_logs"("request_id");

-- CreateIndex
CREATE INDEX "audit_logs_organization_id_created_at_idx" ON "audit_logs"("organization_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_connections" ADD CONSTRAINT "meta_connections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meta_businesses" ADD CONSTRAINT "meta_businesses_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "meta_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_business_accounts" ADD CONSTRAINT "whatsapp_business_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_business_accounts" ADD CONSTRAINT "whatsapp_business_accounts_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "meta_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_business_accounts" ADD CONSTRAINT "whatsapp_business_accounts_business_id_fkey" FOREIGN KEY ("business_id") REFERENCES "meta_businesses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phone_numbers" ADD CONSTRAINT "phone_numbers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phone_numbers" ADD CONSTRAINT "phone_numbers_waba_id_fkey" FOREIGN KEY ("waba_id") REFERENCES "whatsapp_business_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_profiles" ADD CONSTRAINT "business_profiles_phone_number_id_fkey" FOREIGN KEY ("phone_number_id") REFERENCES "phone_numbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_waba_id_fkey" FOREIGN KEY ("waba_id") REFERENCES "whatsapp_business_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_flows" ADD CONSTRAINT "whatsapp_flows_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_flows" ADD CONSTRAINT "whatsapp_flows_waba_id_fkey" FOREIGN KEY ("waba_id") REFERENCES "whatsapp_business_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_configs" ADD CONSTRAINT "webhook_configs_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "meta_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_phone_number_id_fkey" FOREIGN KEY ("phone_number_id") REFERENCES "phone_numbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_phone_number_id_fkey" FOREIGN KEY ("phone_number_id") REFERENCES "phone_numbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_webhook_event_id_fkey" FOREIGN KEY ("webhook_event_id") REFERENCES "webhook_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_status_events" ADD CONSTRAINT "message_status_events_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_status_events" ADD CONSTRAINT "message_status_events_webhook_event_id_fkey" FOREIGN KEY ("webhook_event_id") REFERENCES "webhook_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_phone_number_id_fkey" FOREIGN KEY ("phone_number_id") REFERENCES "phone_numbers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_request_logs" ADD CONSTRAINT "api_request_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
