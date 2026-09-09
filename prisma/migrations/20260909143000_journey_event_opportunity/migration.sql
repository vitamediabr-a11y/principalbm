BEGIN;

CREATE TYPE principal."JourneyEventType" AS ENUM (
  'PREGNANCY_MONTH_5', 'PREGNANCY_MONTH_6', 'PREGNANCY_MONTH_7', 'PREGNANCY_MONTH_8',
  'DPP_MINUS_60', 'DPP_MINUS_30', 'DPP_MINUS_15', 'PREGNANCY_UPDATE_REQUIRED',
  'CHILD_30_DAYS', 'CHILD_3_MONTHS', 'CHILD_6_MONTHS', 'CHILD_9_MONTHS',
  'CHILD_12_MONTHS', 'CHILD_18_MONTHS', 'CHILD_2_YEARS'
);
CREATE TYPE principal."JourneyEventStatus" AS ENUM ('UPCOMING', 'DUE', 'PROCESSED', 'DISMISSED');
CREATE TYPE principal."OpportunityStatus" AS ENUM ('OPEN', 'SNOOZED', 'DISMISSED', 'RESOLVED');
CREATE TYPE principal."OpportunityPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

CREATE TABLE principal."journey_events" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "pregnancyId" UUID,
  "childId" UUID,
  "type" principal."JourneyEventType" NOT NULL,
  "effectiveAt" DATE NOT NULL,
  "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" principal."JourneyEventStatus" NOT NULL DEFAULT 'UPCOMING',
  "dedupeKey" VARCHAR(240) NOT NULL,
  "ruleVersion" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "journey_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "journey_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES principal."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "journey_events_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES principal."customers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "journey_events_pregnancyId_fkey" FOREIGN KEY ("pregnancyId") REFERENCES principal."pregnancies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "journey_events_childId_fkey" FOREIGN KEY ("childId") REFERENCES principal."children"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "journey_events_organizationId_dedupeKey_key" ON principal."journey_events"("organizationId", "dedupeKey");
CREATE UNIQUE INDEX "journey_events_id_organizationId_key" ON principal."journey_events"("id", "organizationId");
CREATE INDEX "journey_events_organizationId_status_effectiveAt_idx" ON principal."journey_events"("organizationId", "status", "effectiveAt");
CREATE INDEX "journey_events_customerId_status_effectiveAt_idx" ON principal."journey_events"("customerId", "status", "effectiveAt");
CREATE INDEX "journey_events_pregnancyId_effectiveAt_idx" ON principal."journey_events"("pregnancyId", "effectiveAt");
CREATE INDEX "journey_events_childId_effectiveAt_idx" ON principal."journey_events"("childId", "effectiveAt");

CREATE TABLE principal."opportunities" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "journeyEventId" UUID NOT NULL,
  "pregnancyId" UUID,
  "childId" UUID,
  "reasonCode" VARCHAR(80) NOT NULL,
  "reasonLabel" VARCHAR(220) NOT NULL,
  "recommendedAt" DATE NOT NULL,
  "priority" principal."OpportunityPriority" NOT NULL,
  "score" INTEGER NOT NULL,
  "responsibleMembershipId" UUID,
  "status" principal."OpportunityStatus" NOT NULL DEFAULT 'OPEN',
  "scoreExplanation" JSONB NOT NULL,
  "suggestedAction" VARCHAR(320) NOT NULL,
  "snoozedUntil" DATE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "opportunities_score_check" CHECK ("score" BETWEEN 0 AND 100),
  CONSTRAINT "opportunities_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES principal."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "opportunities_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES principal."customers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "opportunities_journeyEventId_fkey" FOREIGN KEY ("journeyEventId") REFERENCES principal."journey_events"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "opportunities_pregnancyId_fkey" FOREIGN KEY ("pregnancyId") REFERENCES principal."pregnancies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "opportunities_childId_fkey" FOREIGN KEY ("childId") REFERENCES principal."children"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "opportunities_responsibleMembershipId_fkey" FOREIGN KEY ("responsibleMembershipId") REFERENCES principal."memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "opportunities_journeyEventId_key" ON principal."opportunities"("journeyEventId");
CREATE INDEX "opportunities_organizationId_status_priority_score_recommendedAt_idx" ON principal."opportunities"("organizationId", "status", "priority", "score", "recommendedAt");
CREATE INDEX "opportunities_customerId_status_recommendedAt_idx" ON principal."opportunities"("customerId", "status", "recommendedAt");
CREATE INDEX "opportunities_responsibleMembershipId_status_idx" ON principal."opportunities"("responsibleMembershipId", "status");

ALTER TABLE principal."journey_events"
  ADD CONSTRAINT "journey_events_customer_same_org_fkey"
  FOREIGN KEY ("customerId", "organizationId")
  REFERENCES principal."customers"("id", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE principal."journey_events"
  ADD CONSTRAINT "journey_events_pregnancy_same_customer_fkey"
  FOREIGN KEY ("pregnancyId", "customerId")
  REFERENCES principal."pregnancies"("id", "customerId")
  ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE principal."journey_events"
  ADD CONSTRAINT "journey_events_child_same_customer_fkey"
  FOREIGN KEY ("childId", "customerId")
  REFERENCES principal."children"("id", "customerId")
  ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE principal."opportunities"
  ADD CONSTRAINT "opportunities_customer_same_org_fkey"
  FOREIGN KEY ("customerId", "organizationId")
  REFERENCES principal."customers"("id", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE principal."opportunities"
  ADD CONSTRAINT "opportunities_event_same_org_fkey"
  FOREIGN KEY ("journeyEventId", "organizationId")
  REFERENCES principal."journey_events"("id", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE principal."opportunities"
  ADD CONSTRAINT "opportunities_pregnancy_same_customer_fkey"
  FOREIGN KEY ("pregnancyId", "customerId")
  REFERENCES principal."pregnancies"("id", "customerId")
  ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE principal."opportunities"
  ADD CONSTRAINT "opportunities_child_same_customer_fkey"
  FOREIGN KEY ("childId", "customerId")
  REFERENCES principal."children"("id", "customerId")
  ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE principal."opportunities"
  ADD CONSTRAINT "opportunities_responsible_same_org_fkey"
  FOREIGN KEY ("responsibleMembershipId", "organizationId")
  REFERENCES principal."memberships"("id", "organizationId")
  ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE principal."journey_events" ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_runtime_server_access ON principal."journey_events" FOR ALL TO crm_runtime USING (true) WITH CHECK (true);
ALTER TABLE principal."opportunities" ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_runtime_server_access ON principal."opportunities" FOR ALL TO crm_runtime USING (true) WITH CHECK (true);
REVOKE ALL ON TABLE principal."journey_events", principal."opportunities" FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE principal."journey_events", principal."opportunities" TO crm_runtime;
GRANT USAGE ON TYPE principal."JourneyEventType", principal."JourneyEventStatus", principal."OpportunityStatus", principal."OpportunityPriority" TO crm_runtime;
REVOKE ALL ON TYPE principal."JourneyEventType", principal."JourneyEventStatus", principal."OpportunityStatus", principal."OpportunityPriority" FROM anon, authenticated;

COMMIT;
