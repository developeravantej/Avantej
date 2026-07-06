/**
 * commission-tracks — mutation procedures.
 *
 * Permission: commission_track_management:write (mapped to "create"/"update")
 */

import { z } from "zod";
import { tenantProcedure } from "../../index";
import {
	assertOrgContextMatch,
	assertTenantContext,
	requirePermissionOrpc,
} from "../../guards";
import {
	deactivateTrack,
	setCoachSlots,
	setTrackRates,
	upsertTrack,
} from "@avantej-core/services/commission-tracks.service";
import type {
	CommissionBasis,
	CommissionPaymentType,
	CommissionPoolPolicy,
	CommissionRoleType,
	CommissionSalesType,
	CommissionTrackScope,
	CommissionTrigger,
} from "@avantej-core/types";

// ---------------------------------------------------------------------------
// Shared enum arrays — derived from canonical type unions in @avantej-core/types
// ---------------------------------------------------------------------------

const SCOPE_VALUES: [CommissionTrackScope, ...CommissionTrackScope[]] = [
	"category",
	"org",
	"product",
];

const ROLE_TYPE_VALUES: [CommissionRoleType, ...CommissionRoleType[]] = [
	"trainer",
	"sales",
	"marketing",
	"referrer",
];

const TRIGGER_VALUES: [CommissionTrigger, ...CommissionTrigger[]] = [
	"on_completion",
	"on_sale",
];

const BASIS_VALUES: [CommissionBasis, ...CommissionBasis[]] = [
	"delivery_total",
	"gross_order",
	"net_order",
	"flat",
];

const PAYMENT_TYPE_VALUES: [CommissionPaymentType, ...CommissionPaymentType[]] =
	["fixed", "variable"];

const POOL_POLICY_VALUES: [CommissionPoolPolicy, ...CommissionPoolPolicy[]] = [
	"separate",
	"shared",
];

const SALES_TYPE_VALUES: [CommissionSalesType, ...CommissionSalesType[]] = [
	"new",
	"renewal",
	"any",
];

// ---------------------------------------------------------------------------
// upsertTrack
// ---------------------------------------------------------------------------

const upsertTrackProcedure = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			/** Omit to create a new track. */
			id: z.string().uuid().optional(),
			categoryId: z.string().uuid().nullable().optional(),
			scope: z.enum(SCOPE_VALUES),
			roleType: z.enum(ROLE_TYPE_VALUES),
			trigger: z.enum(TRIGGER_VALUES),
			basis: z.enum(BASIS_VALUES),
			paymentType: z.enum(PAYMENT_TYPE_VALUES),
			poolPolicy: z.enum(POOL_POLICY_VALUES),
			/** Positive integer — number of earners. */
			maxBeneficiaries: z.number().int().min(1),
			/** Integer cents. Null = uncapped. */
			maxPerCycleCents: z.number().int().min(0).nullable().optional(),
			/** Integer cents. Null = uncapped per split. */
			capAmountCents: z.number().int().min(0).nullable().optional(),
			/** Integer cents. Null = no floor. */
			floorAmountCents: z.number().int().min(0).nullable().optional(),
			/** Basis points (e.g. 2000 = 20%). Null = no exclusion. */
			excludeIfDiscountAbovePct: z
				.number()
				.int()
				.min(0)
				.max(10000)
				.nullable()
				.optional(),
			salesType: z.enum(SALES_TYPE_VALUES).optional(),
			isActive: z.boolean().optional(),
		}),
	)
	.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
		assertTenantContext(context);
		await requirePermissionOrpc(
			context.tenantDb,
			context.member,
			"commission_track_management",
			input.id ? "update" : "create",
		);

		return upsertTrack(context.tenantDb, {
			id: input.id,
			categoryId: input.categoryId,
			scope: input.scope,
			roleType: input.roleType,
			trigger: input.trigger,
			basis: input.basis,
			paymentType: input.paymentType,
			poolPolicy: input.poolPolicy,
			salesType: input.salesType,
			maxBeneficiaries: input.maxBeneficiaries,
			maxPerCycleCents: input.maxPerCycleCents,
			capAmountCents: input.capAmountCents,
			floorAmountCents: input.floorAmountCents,
			excludeIfDiscountAbovePct: input.excludeIfDiscountAbovePct,
			isActive: input.isActive,
		});
	});

// ---------------------------------------------------------------------------
// setTrackRates
// ---------------------------------------------------------------------------

const setTrackRatesProcedure = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			trackId: z.string().uuid(),
			rates: z.array(
				z.object({
					tierId: z.string().uuid(),
					/** Integer cents (fixed) or basis points (variable). */
					amount: z.number().int().min(0),
				}),
			),
		}),
	)
	.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
		assertTenantContext(context);
		await requirePermissionOrpc(
			context.tenantDb,
			context.member,
			"commission_track_management",
			"update",
		);

		return setTrackRates(context.tenantDb, {
			trackId: input.trackId,
			rates: input.rates,
		});
	});

// ---------------------------------------------------------------------------
// setCoachSlots
// ---------------------------------------------------------------------------

const setCoachSlotsProcedure = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			trackId: z.string().uuid(),
			slots: z.array(
				z.object({
					slotIndex: z.number().int().min(0),
					label: z.string().min(1),
					/** Basis points. All slots must sum to 10000. */
					weightageBasisPoints: z.number().int().min(1).max(10000),
				}),
			),
		}),
	)
	.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
		assertTenantContext(context);
		await requirePermissionOrpc(
			context.tenantDb,
			context.member,
			"commission_track_management",
			"update",
		);

		return setCoachSlots(context.tenantDb, {
			trackId: input.trackId,
			slots: input.slots,
		});
	});

// ---------------------------------------------------------------------------
// deactivateTrack
// ---------------------------------------------------------------------------

const deactivateTrackProcedure = tenantProcedure
	.input(
		z.object({
			organizationId: z.string().uuid(),
			trackId: z.string().uuid(),
		}),
	)
	.handler(async ({ input, context }) => {
		assertOrgContextMatch(context, input);
		assertTenantContext(context);
		await requirePermissionOrpc(
			context.tenantDb,
			context.member,
			"commission_track_management",
			"update",
		);

		return deactivateTrack(context.tenantDb, input.trackId);
	});

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export const commissionTracksMutateProcedures = {
	upsertTrack: upsertTrackProcedure,
	setTrackRates: setTrackRatesProcedure,
	setCoachSlots: setCoachSlotsProcedure,
	deactivateTrack: deactivateTrackProcedure,
};
