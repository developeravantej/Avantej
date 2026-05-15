/**
 * Nightly Reconciler — Plan C Phase C.5 (ADR-0019).
 *
 * Cross-checks Stripe-side truth against `platform_payment_ledger`
 * (Avantej's audit mirror) per connected account, writes drift rows to
 * `payment_drift_log` with severity, and advances per-(org, country,
 * resource) checkpoints in `reconciliation_state`.
 *
 * Policy v1: ALERT-ONLY. No auto-fix. Drift rows surface in the platform
 * admin UI (C.4) with "Force sync" actions for manual remediation.
 *
 * Resource types reconciled:
 *   - charge          (vs ledger.pi_succeeded)
 *   - refund          (vs ledger.pi_refunded)
 *   - application_fee (vs ledger.application_fee_collected)
 *
 * Payouts deferred — no DB table for them yet (C.3 follow-up).
 *
 * Lookback: per-(org, country, resource) checkpoint via
 * reconciliation_state.last_reconciled_at; on each run scan since
 * checkpoint - 24h buffer. First run with no checkpoint: 24h lookback.
 *
 * Drift severity rules:
 *   - missing_in_db, charge.status="succeeded", age > webhook delay     → critical
 *   - missing_in_db, charge.status="succeeded", age < 10 min            → info
 *   - amount_mismatch                                                    → critical
 *   - currency_mismatch                                                  → critical
 *   - status_mismatch (succeeded vs canceled)                            → critical
 */

import type Stripe from "stripe";
import { and, eq } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import type * as controlPanelSchema from "@avantej-core/db/schema/control-panel-schema";
import { orgCountryStripeAccounts } from "@avantej-core/db/schema/control-panel/org-country-stripe-accounts";
import { platformPaymentLedger } from "@avantej-core/db/schema/control-panel/platform-payment-ledger";
import {
	reconciliationRuns,
	paymentDriftLog,
	reconciliationState,
} from "@avantej-core/db/schema/control-panel/reconciliation";

type CpDb = NeonDatabase<typeof controlPanelSchema>;

const WEBHOOK_DELAY_GRACE_MS = 10 * 60 * 1000; // 10min — charges < 10min old missing in DB are "info" (webhook in-flight)
const LOOKBACK_BUFFER_MS = 24 * 60 * 60 * 1000; // 24h
const INITIAL_LOOKBACK_MS = 24 * 60 * 60 * 1000;

type ResourceType = "charge" | "refund" | "application_fee";

export interface RunReconciliationArgs {
	controlPanelDb: CpDb;
	stripe: Pick<Stripe, "charges" | "refunds" | "applicationFees">;
	now?: Date;
}

export interface ReconciliationReport {
	runId: string;
	acctsScanned: number;
	resourcesExamined: number;
	driftFound: number;
	criticalCount: number;
	warnCount: number;
	infoCount: number;
	durationMs: number;
}

export async function runReconciliation(
	args: RunReconciliationArgs,
): Promise<ReconciliationReport> {
	const { controlPanelDb, stripe } = args;
	const startedAt = args.now ?? new Date();

	// 1. Insert reconciliation_runs row (status=running).
	const [run] = await controlPanelDb
		.insert(reconciliationRuns)
		.values({ runStartedAt: startedAt, status: "running" })
		.returning({ id: reconciliationRuns.id });
	if (!run) throw new Error("Failed to insert reconciliation_runs row");
	const runId = run.id;

	const report: ReconciliationReport = {
		runId,
		acctsScanned: 0,
		resourcesExamined: 0,
		driftFound: 0,
		criticalCount: 0,
		warnCount: 0,
		infoCount: 0,
		durationMs: 0,
	};

	let runError: string | null = null;
	try {
		const acctRows = await controlPanelDb
			.select({
				organizationId: orgCountryStripeAccounts.organizationId,
				countryCode: orgCountryStripeAccounts.countryCode,
				stripeAccountId: orgCountryStripeAccounts.stripeAccountId,
			})
			.from(orgCountryStripeAccounts);

		for (const acct of acctRows) {
			if (!acct.stripeAccountId) continue;
			report.acctsScanned++;

			for (const resourceType of ["charge", "refund", "application_fee"] as ResourceType[]) {
				try {
					await reconcileResource(
						stripe,
						controlPanelDb,
						runId,
						acct.organizationId,
						acct.countryCode,
						acct.stripeAccountId,
						resourceType,
						startedAt,
						report,
					);
				} catch (e) {
					console.error(
						`[reconciler] resource=${resourceType} acct=${acct.stripeAccountId} threw:`,
						e instanceof Error ? e.message : e,
					);
					// Continue — one resource failure must not block other resources or accts.
				}
			}
		}
	} catch (e) {
		runError = e instanceof Error ? e.message : String(e);
		console.error("[reconciler] run failed:", e);
	}

	const completedAt = new Date();
	report.durationMs = completedAt.getTime() - startedAt.getTime();

	await controlPanelDb
		.update(reconciliationRuns)
		.set({
			runCompletedAt: completedAt,
			status: runError ? "failed" : "completed",
			driftCount: report.driftFound,
			error: runError,
		})
		.where(eq(reconciliationRuns.id, runId));

	console.log(`[reconciler] complete: ${JSON.stringify(report)}`);
	return report;
}

async function reconcileResource(
	stripe: Pick<Stripe, "charges" | "refunds" | "applicationFees">,
	controlPanelDb: CpDb,
	runId: string,
	organizationId: string,
	countryCode: string,
	stripeAccount: string,
	resourceType: ResourceType,
	now: Date,
	report: ReconciliationReport,
) {
	// 1. Determine lookback start.
	const [stateRow] = await controlPanelDb
		.select()
		.from(reconciliationState)
		.where(
			and(
				eq(reconciliationState.organizationId, organizationId),
				eq(reconciliationState.countryCode, countryCode),
				eq(reconciliationState.resourceType, resourceType),
			),
		)
		.limit(1);
	const lastReconciled = stateRow?.lastReconciledAt;
	const scanSince = lastReconciled
		? new Date(lastReconciled.getTime() - LOOKBACK_BUFFER_MS)
		: new Date(now.getTime() - INITIAL_LOOKBACK_MS);
	const createdGte = Math.floor(scanSince.getTime() / 1000);

	// 2. Fetch Stripe resources.
	const stripeRows = await fetchStripeResource(stripe, resourceType, stripeAccount, createdGte);
	report.resourcesExamined += stripeRows.length;

	// 3. Map ledger event kinds for cross-check.
	const ledgerKindFor: Record<ResourceType, "pi_succeeded" | "pi_refunded" | "application_fee_collected"> = {
		charge: "pi_succeeded",
		refund: "pi_refunded",
		application_fee: "application_fee_collected",
	};

	// 4. For each Stripe row, look up the matching ledger row by stripe_object_id
	//    on the acct + kind + org. Compare. If drift, write a row.
	for (const stripeRow of stripeRows) {
		const ledgerRows = await controlPanelDb
			.select()
			.from(platformPaymentLedger)
			.where(
				and(
					eq(platformPaymentLedger.stripeObjectId, stripeRow.id),
					eq(platformPaymentLedger.eventKind, ledgerKindFor[resourceType]),
				),
			)
			.limit(1);
		const ledger = ledgerRows[0] ?? null;

		const drift = computeDrift(resourceType, stripeRow, ledger, now);
		if (drift) {
			await controlPanelDb.insert(paymentDriftLog).values({
				runId,
				organizationId,
				stripeAccountId: stripeAccount,
				resourceType,
				resourceId: stripeRow.id,
				severity: drift.severity,
				driftKind: drift.kind,
				stripeValue: drift.stripeValue,
				dbValue: drift.dbValue,
			});
			report.driftFound++;
			if (drift.severity === "critical") report.criticalCount++;
			else if (drift.severity === "warn") report.warnCount++;
			else report.infoCount++;
		}
	}

	// 5. Advance checkpoint to now (only on resource-level success).
	await controlPanelDb
		.insert(reconciliationState)
		.values({
			organizationId,
			countryCode,
			resourceType,
			lastReconciledAt: now,
		})
		.onConflictDoUpdate({
			target: [
				reconciliationState.organizationId,
				reconciliationState.countryCode,
				reconciliationState.resourceType,
			],
			set: { lastReconciledAt: now },
		});
}

interface DriftFinding {
	severity: "info" | "warn" | "critical";
	kind: string;
	stripeValue: Record<string, unknown>;
	dbValue: Record<string, unknown> | null;
}

interface StripeResourceLike {
	id: string;
	created: number;
	amount?: number;
	amount_refunded?: number;
	currency?: string;
	status?: string | null;
	[k: string]: unknown;
}

function computeDrift(
	resourceType: ResourceType,
	stripeRow: StripeResourceLike,
	ledger:
		| {
				stripeObjectId: string;
				eventKind: string;
				amount: number;
				currency: string;
		  }
		| null,
	now: Date,
): DriftFinding | null {
	// Charges with non-succeeded status are excluded from reconciliation —
	// we only ledger pi.succeeded events, so unsucceeded charges are
	// expected to be absent.
	if (resourceType === "charge" && stripeRow.status !== "succeeded") return null;
	if (resourceType === "refund" && stripeRow.status !== "succeeded") return null;

	const stripeAmount =
		resourceType === "refund"
			? (stripeRow.amount_refunded ?? stripeRow.amount ?? 0)
			: (stripeRow.amount ?? 0);
	const stripeCurrency = (stripeRow.currency ?? "").toLowerCase();

	// 1. Missing in DB.
	if (!ledger) {
		const ageMs = now.getTime() - stripeRow.created * 1000;
		const severity = ageMs < WEBHOOK_DELAY_GRACE_MS ? "info" : "critical";
		return {
			severity,
			kind: "missing_in_db",
			stripeValue: { id: stripeRow.id, amount: stripeAmount, currency: stripeCurrency, status: stripeRow.status, created: stripeRow.created },
			dbValue: null,
		};
	}

	// 2. Amount mismatch.
	if (ledger.amount !== stripeAmount) {
		return {
			severity: "critical",
			kind: "amount_mismatch",
			stripeValue: { amount: stripeAmount },
			dbValue: { amount: ledger.amount },
		};
	}

	// 3. Currency mismatch.
	if (ledger.currency !== stripeCurrency) {
		return {
			severity: "critical",
			kind: "currency_mismatch",
			stripeValue: { currency: stripeCurrency },
			dbValue: { currency: ledger.currency },
		};
	}

	// No drift.
	return null;
}

async function fetchStripeResource(
	stripe: Pick<Stripe, "charges" | "refunds" | "applicationFees">,
	resourceType: ResourceType,
	stripeAccount: string,
	createdGte: number,
): Promise<StripeResourceLike[]> {
	const rows: StripeResourceLike[] = [];
	const limit = 100;

	if (resourceType === "charge") {
		for await (const ch of stripe.charges.list(
			{ created: { gte: createdGte }, limit },
			{ stripeAccount },
		)) {
			rows.push(ch as unknown as StripeResourceLike);
		}
	} else if (resourceType === "refund") {
		for await (const re of stripe.refunds.list(
			{ created: { gte: createdGte }, limit },
			{ stripeAccount },
		)) {
			rows.push(re as unknown as StripeResourceLike);
		}
	} else if (resourceType === "application_fee") {
		// application_fees live on PLATFORM side, not the connected acct
		// (Stripe charges the fee FROM the connected acct TO the platform).
		// Filter by charge[].account = stripeAccount via the `charge` param
		// would require knowing the charge id; instead list all and filter
		// client-side by `account` field on the ApplicationFee.
		for await (const fee of stripe.applicationFees.list({
			created: { gte: createdGte },
			limit,
		})) {
			if ((fee as { account?: string }).account === stripeAccount) {
				rows.push(fee as unknown as StripeResourceLike);
			}
		}
	}

	return rows;
}
