BEGIN;

CREATE UNIQUE INDEX "memberships_id_organizationId_key"
  ON principal."memberships"("id", "organizationId");
CREATE UNIQUE INDEX "customers_id_organizationId_key"
  ON principal."customers"("id", "organizationId");
CREATE UNIQUE INDEX "children_id_customerId_key"
  ON principal."children"("id", "customerId");
CREATE UNIQUE INDEX "pregnancies_id_customerId_key"
  ON principal."pregnancies"("id", "customerId");

ALTER TABLE principal."customers"
  ADD CONSTRAINT "customers_responsible_membership_same_org_fkey"
  FOREIGN KEY ("responsibleMembershipId", "organizationId")
  REFERENCES principal."memberships"("id", "organizationId")
  ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE principal."lifecycle_events"
  ADD CONSTRAINT "lifecycle_events_customer_same_org_fkey"
  FOREIGN KEY ("customerId", "organizationId")
  REFERENCES principal."customers"("id", "organizationId")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE principal."audit_logs"
  ADD CONSTRAINT "audit_logs_customer_same_org_fkey"
  FOREIGN KEY ("customerId", "organizationId")
  REFERENCES principal."customers"("id", "organizationId")
  ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE principal."pregnancies"
  ADD CONSTRAINT "pregnancies_confirmed_child_same_customer_fkey"
  FOREIGN KEY ("confirmedChildId", "customerId")
  REFERENCES principal."children"("id", "customerId")
  ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE principal."lifecycle_events"
  ADD CONSTRAINT "lifecycle_events_pregnancy_same_customer_fkey"
  FOREIGN KEY ("pregnancyId", "customerId")
  REFERENCES principal."pregnancies"("id", "customerId")
  ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE principal."lifecycle_events"
  ADD CONSTRAINT "lifecycle_events_child_same_customer_fkey"
  FOREIGN KEY ("childId", "customerId")
  REFERENCES principal."children"("id", "customerId")
  ON DELETE NO ACTION ON UPDATE CASCADE;

COMMIT;
