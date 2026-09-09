BEGIN;

CREATE SCHEMA principal AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA principal FROM PUBLIC;
REVOKE ALL ON SCHEMA principal FROM anon, authenticated;
GRANT USAGE ON SCHEMA principal TO crm_runtime;

CREATE TYPE principal."BusinessRole" AS ENUM ('OWNER', 'MANAGER', 'SELLER', 'MARKETING');
CREATE TYPE principal."CustomerStatus" AS ENUM ('CUSTOMER', 'RECURRING', 'VIP', 'INACTIVE', 'DO_NOT_CONTACT', 'ARCHIVED');
CREATE TYPE principal."CustomerSource" AS ENUM ('PHYSICAL_STORE', 'WHATSAPP', 'INSTAGRAM', 'WEBSITE', 'REFERRAL', 'EVENT', 'OTHER');
CREATE TYPE principal."PregnancyStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ARCHIVED');
CREATE TYPE principal."Gender" AS ENUM ('FEMALE', 'MALE', 'OTHER', 'NOT_INFORMED');
CREATE TYPE principal."LifecycleEventType" AS ENUM ('PREGNANCY_ADDED', 'DUE_DATE_UPDATED', 'BIRTH_CONFIRMED', 'CHILD_ADDED', 'CHILD_UPDATED');
CREATE TYPE principal."ConsentChannel" AS ENUM ('WHATSAPP', 'EMAIL', 'SMS', 'PHONE');
CREATE TYPE principal."ConsentStatus" AS ENUM ('GRANTED', 'REVOKED');

CREATE TABLE principal."user" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "emailVerified" BOOLEAN NOT NULL DEFAULT false,
  "image" TEXT,
  "role" TEXT DEFAULT 'user',
  "banned" BOOLEAN DEFAULT false,
  "banReason" TEXT,
  "banExpires" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "user_email_key" ON principal."user"("email");

CREATE TABLE principal."session" (
  "id" UUID NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "token" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId" UUID NOT NULL,
  "impersonatedBy" TEXT,
  CONSTRAINT "session_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES principal."user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "session_token_key" ON principal."session"("token");
CREATE INDEX "session_userId_idx" ON principal."session"("userId");

CREATE TABLE principal."account" (
  "id" UUID NOT NULL,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" UUID NOT NULL,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" TIMESTAMP(3),
  "refreshTokenExpiresAt" TIMESTAMP(3),
  "scope" TEXT,
  "password" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "account_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES principal."user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "account_providerId_accountId_key" ON principal."account"("providerId", "accountId");
CREATE INDEX "account_userId_idx" ON principal."account"("userId");

CREATE TABLE principal."verification" (
  "id" UUID NOT NULL,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "verification_identifier_idx" ON principal."verification"("identifier");

CREATE TABLE principal."rate_limit" (
  "id" UUID NOT NULL,
  "key" TEXT NOT NULL,
  "count" INTEGER NOT NULL,
  "lastRequest" BIGINT NOT NULL,
  CONSTRAINT "rate_limit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "rate_limit_key_key" ON principal."rate_limit"("key");

CREATE TABLE principal."organizations" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE principal."memberships" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "role" principal."BusinessRole" NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "memberships_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "memberships_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES principal."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES principal."user"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "memberships_organizationId_userId_key" ON principal."memberships"("organizationId", "userId");
CREATE INDEX "memberships_userId_active_idx" ON principal."memberships"("userId", "active");
CREATE INDEX "memberships_organizationId_role_idx" ON principal."memberships"("organizationId", "role");

CREATE TABLE principal."customers" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "whatsapp" VARCHAR(32),
  "whatsappNormalized" VARCHAR(20),
  "phone" VARCHAR(32),
  "phoneNormalized" VARCHAR(20),
  "email" VARCHAR(320),
  "city" VARCHAR(120),
  "source" principal."CustomerSource" NOT NULL,
  "responsibleMembershipId" UUID,
  "status" principal."CustomerStatus" NOT NULL DEFAULT 'CUSTOMER',
  "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "customers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "customers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES principal."organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "customers_responsibleMembershipId_fkey" FOREIGN KEY ("responsibleMembershipId") REFERENCES principal."memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "customers_organizationId_whatsappNormalized_key" ON principal."customers"("organizationId", "whatsappNormalized");
CREATE UNIQUE INDEX "customers_organizationId_phoneNormalized_key" ON principal."customers"("organizationId", "phoneNormalized");
CREATE INDEX "customers_organizationId_name_idx" ON principal."customers"("organizationId", "name");
CREATE INDEX "customers_organizationId_status_idx" ON principal."customers"("organizationId", "status");
CREATE INDEX "customers_organizationId_source_idx" ON principal."customers"("organizationId", "source");
CREATE INDEX "customers_organizationId_responsibleMembershipId_idx" ON principal."customers"("organizationId", "responsibleMembershipId");

CREATE TABLE principal."children" (
  "id" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "name" VARCHAR(120),
  "birthDate" DATE NOT NULL,
  "gender" principal."Gender",
  "currentSize" VARCHAR(20),
  "preferences" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "children_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "children_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES principal."customers"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "children_customerId_birthDate_idx" ON principal."children"("customerId", "birthDate");

CREATE TABLE principal."pregnancies" (
  "id" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "expectedDueDate" DATE NOT NULL,
  "reportedPregnancyWeek" INTEGER,
  "reportedPregnancyMonth" INTEGER,
  "babyName" VARCHAR(120),
  "gender" principal."Gender",
  "status" principal."PregnancyStatus" NOT NULL DEFAULT 'ACTIVE',
  "informationUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "commercialNotes" TEXT,
  "confirmedBirthDate" DATE,
  "confirmedChildId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pregnancies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pregnancies_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES principal."customers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "pregnancies_confirmedChildId_fkey" FOREIGN KEY ("confirmedChildId") REFERENCES principal."children"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "pregnancies_reported_week_check" CHECK ("reportedPregnancyWeek" IS NULL OR "reportedPregnancyWeek" BETWEEN 1 AND 40),
  CONSTRAINT "pregnancies_reported_month_check" CHECK ("reportedPregnancyMonth" IS NULL OR "reportedPregnancyMonth" BETWEEN 1 AND 9)
);
CREATE UNIQUE INDEX "pregnancies_confirmedChildId_key" ON principal."pregnancies"("confirmedChildId");
CREATE UNIQUE INDEX "pregnancies_one_active_per_customer" ON principal."pregnancies"("customerId") WHERE "status" = 'ACTIVE';
CREATE INDEX "pregnancies_customerId_status_idx" ON principal."pregnancies"("customerId", "status");
CREATE INDEX "pregnancies_expectedDueDate_idx" ON principal."pregnancies"("expectedDueDate");

CREATE TABLE principal."lifecycle_events" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "pregnancyId" UUID,
  "childId" UUID,
  "type" principal."LifecycleEventType" NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB,
  CONSTRAINT "lifecycle_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lifecycle_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES principal."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "lifecycle_events_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES principal."customers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "lifecycle_events_pregnancyId_fkey" FOREIGN KEY ("pregnancyId") REFERENCES principal."pregnancies"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "lifecycle_events_childId_fkey" FOREIGN KEY ("childId") REFERENCES principal."children"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "lifecycle_events_customerId_occurredAt_idx" ON principal."lifecycle_events"("customerId", "occurredAt" DESC);
CREATE INDEX "lifecycle_events_organizationId_occurredAt_idx" ON principal."lifecycle_events"("organizationId", "occurredAt" DESC);

CREATE TABLE principal."audit_logs" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "actorUserId" UUID,
  "customerId" UUID,
  "action" VARCHAR(80) NOT NULL,
  "entityType" VARCHAR(80) NOT NULL,
  "entityId" UUID NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "audit_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES principal."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES principal."user"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "audit_logs_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES principal."customers"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "audit_logs_organizationId_createdAt_idx" ON principal."audit_logs"("organizationId", "createdAt" DESC);
CREATE INDEX "audit_logs_customerId_createdAt_idx" ON principal."audit_logs"("customerId", "createdAt" DESC);
CREATE INDEX "audit_logs_entityType_entityId_idx" ON principal."audit_logs"("entityType", "entityId");

CREATE TABLE principal."consents" (
  "id" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "channel" principal."ConsentChannel" NOT NULL,
  "purpose" VARCHAR(120) NOT NULL,
  "status" principal."ConsentStatus" NOT NULL,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "source" VARCHAR(120),
  "version" VARCHAR(40),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "consents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "consents_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES principal."customers"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "consents_customerId_channel_purpose_idx" ON principal."consents"("customerId", "channel", "purpose");

DO $do$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['user','session','account','verification','rate_limit','organizations','memberships','customers','pregnancies','children','lifecycle_events','audit_logs','consents']
  LOOP
    EXECUTE format('ALTER TABLE principal.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY crm_runtime_server_access ON principal.%I FOR ALL TO crm_runtime USING (true) WITH CHECK (true)', table_name);
    EXECUTE format('REVOKE ALL ON TABLE principal.%I FROM anon, authenticated', table_name);
  END LOOP;
END
$do$;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  principal."user", principal."session", principal."account", principal."verification", principal."rate_limit",
  principal."memberships", principal."customers", principal."pregnancies", principal."children",
  principal."lifecycle_events", principal."consents"
TO crm_runtime;
GRANT SELECT, INSERT, UPDATE ON TABLE principal."organizations" TO crm_runtime;
GRANT SELECT, INSERT ON TABLE principal."audit_logs" TO crm_runtime;

ALTER ROLE crm_runtime SET search_path = principal, public, pg_temp;
ALTER ROLE crm_app SET search_path = principal, public, pg_temp;

COMMIT;
