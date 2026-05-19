-- migration: 0052_relax_commission_split_constraint
-- description: Relax commission_splits_source_check to allow manual adjustments
--   that don't target an appointment/sales-order/package-instance.
--
-- Background: migration 0046 added a "exactly one of (appointment_id |
-- sales_order_id | package_instance_id) must be NOT NULL" constraint, which
-- broke commissionSplits.createManualAdjustment (it sets all three to NULL).
-- Surfaced by the e2e payouts-confirm-creates-row spec.
--
-- New rule: manual adjustments may have zero or one target FK; everything
-- else still requires exactly one.

ALTER TABLE "commission_splits" DROP CONSTRAINT IF EXISTS "commission_splits_source_check";
--> statement-breakpoint

ALTER TABLE "commission_splits" ADD CONSTRAINT "commission_splits_source_check"
	CHECK (
		(
			split_type = 'manual'
			AND ((appointment_id IS NOT NULL)::int +
			     (sales_order_id IS NOT NULL)::int +
			     (package_instance_id IS NOT NULL)::int) <= 1
		)
		OR
		(
			split_type <> 'manual'
			AND ((appointment_id IS NOT NULL)::int +
			     (sales_order_id IS NOT NULL)::int +
			     (package_instance_id IS NOT NULL)::int) = 1
		)
	) NOT VALID;
--> statement-breakpoint

ALTER TABLE "commission_splits" VALIDATE CONSTRAINT "commission_splits_source_check";
