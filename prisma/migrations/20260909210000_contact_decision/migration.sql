BEGIN;

CREATE TYPE principal."ContactDecisionStatus" AS ENUM ('PROCEED', 'WAIT', 'BLOCKED', 'SUPPRESSED');

CREATE UNIQUE INDEX "opportunities_id_customer_org_key"
  ON principal."opportunities"("id", "customerId", "organizationId");

CREATE TABLE principal."contact_decisions" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "customerId" UUID NOT NULL,
  "opportunityId" UUID NOT NULL,
  "status" principal."ContactDecisionStatus" NOT NULL,
  "channel" principal."ConsentChannel" NOT NULL DEFAULT 'WHATSAPP',
  "evaluatedAt" TIMESTAMP(3) NOT NULL,
  "eligibleAt" DATE,
  "primaryReasonCode" VARCHAR(80) NOT NULL,
  "reasonsJson" JSONB NOT NULL,
  "suppressedByOpportunityId" UUID,
  "policyVersion" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "contact_decisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "contact_decisions_whatsapp_only_check" CHECK ("channel" = 'WHATSAPP'),
  CONSTRAINT "contact_decisions_suppression_state_check" CHECK (
    ("status" = 'SUPPRESSED' AND "suppressedByOpportunityId" IS NOT NULL)
    OR
    ("status" <> 'SUPPRESSED' AND "suppressedByOpportunityId" IS NULL)
  ),
  CONSTRAINT "contact_decisions_not_self_suppressed_check" CHECK (
    "suppressedByOpportunityId" IS NULL OR "suppressedByOpportunityId" <> "opportunityId"
  ),
  CONSTRAINT "contact_decisions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES principal."organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "contact_decisions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES principal."customers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "contact_decisions_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES principal."opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "contact_decisions_suppressedByOpportunityId_fkey" FOREIGN KEY ("suppressedByOpportunityId") REFERENCES principal."opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "contact_decisions_opportunityId_key"
  ON principal."contact_decisions"("opportunityId");
CREATE INDEX "contact_decisions_organizationId_status_evaluatedAt_idx"
  ON principal."contact_decisions"("organizationId", "status", "evaluatedAt");
CREATE INDEX "contact_decisions_customerId_status_idx"
  ON principal."contact_decisions"("customerId", "status");
CREATE INDEX "contact_decisions_suppressedByOpportunityId_idx"
  ON principal."contact_decisions"("suppressedByOpportunityId");

ALTER TABLE principal."contact_decisions"
  ADD CONSTRAINT "contact_decisions_customer_same_org_fkey"
  FOREIGN KEY ("customerId", "organizationId")
  REFERENCES principal."customers"("id", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE principal."contact_decisions"
  ADD CONSTRAINT "contact_decisions_opportunity_same_customer_org_fkey"
  FOREIGN KEY ("opportunityId", "customerId", "organizationId")
  REFERENCES principal."opportunities"("id", "customerId", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE principal."contact_decisions"
  ADD CONSTRAINT "contact_decisions_suppressed_same_customer_org_fkey"
  FOREIGN KEY ("suppressedByOpportunityId", "customerId", "organizationId")
  REFERENCES principal."opportunities"("id", "customerId", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE principal."contact_decisions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY crm_runtime_server_access
  ON principal."contact_decisions"
  FOR ALL TO crm_runtime
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE principal."contact_decisions" FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE principal."contact_decisions" TO crm_runtime;
GRANT USAGE ON TYPE principal."ContactDecisionStatus" TO crm_runtime;
REVOKE ALL ON TYPE principal."ContactDecisionStatus" FROM anon, authenticated;

COMMIT;
