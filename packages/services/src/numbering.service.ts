/**
 * WS3 (MOVE parity) — opt-in gapless per-branch document numbering.
 *
 * A branch that has an invoice/receipt prefix configured on branch_details
 * gets its own gapless counter (branch_number_sequences); the number is
 * `${prefix}${seq.padStart(6,'0')}`. The counter is incremented with an
 * atomic upsert (INSERT ... ON CONFLICT DO UPDATE ... RETURNING) inside the
 * SAME transaction that writes the document, so it is race-safe and gapless.
 *
 * Branches with NO prefix return null → the caller keeps using the existing
 * global tenant_*_seq sequence, so behavior is UNCHANGED until an owner opts
 * in per branch. This is deliberately backward-compatible.
 */

import { branchDetails } from "@avantej-core/db/schema/tenant/branch-details";
import { branchNumberSequences } from "@avantej-core/db/schema/tenant/branch-number-sequences";
import type * as tenantSchema from "@avantej-core/db/schema/tenant-schema";
import { eq, sql } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";

type TenantDbOrTx = NeonDatabase<typeof tenantSchema>;

export type BranchDocType = "invoice" | "receipt";

const SEQ_PAD = 6;

/**
 * The configured prefix for a branch + doc type, or null when the branch has
 * not opted into per-branch numbering.
 */
async function branchPrefix(
	tx: TenantDbOrTx,
	branchNodeId: string,
	docType: BranchDocType,
): Promise<string | null> {
	const [row] = await tx
		.select({
			invoicePrefix: branchDetails.invoicePrefix,
			receiptPrefix: branchDetails.receiptPrefix,
		})
		.from(branchDetails)
		.where(eq(branchDetails.nodeId, branchNodeId))
		.limit(1);
	if (!row) return null;
	const prefix = docType === "invoice" ? row.invoicePrefix : row.receiptPrefix;
	const trimmed = prefix?.trim();
	return trimmed ? trimmed : null;
}

/**
 * Returns the next gapless per-branch document number, or `null` when the
 * branch has no prefix configured (caller should fall back to the global
 * sequence). MUST be called inside the document-writing transaction so the
 * counter and the document commit or roll back together.
 *
 * @param tx           the active transaction (not a bare pool) for gaplessness
 * @param branchNodeId the branch hierarchy node the document belongs to
 * @param docType      'invoice' | 'receipt'
 */
export async function nextBranchDocNumber(
	tx: TenantDbOrTx,
	branchNodeId: string | null | undefined,
	docType: BranchDocType,
): Promise<string | null> {
	if (!branchNodeId) return null;
	const prefix = await branchPrefix(tx, branchNodeId, docType);
	if (!prefix) return null;

	// Atomic upsert-and-increment: creates the counter at 1 on a branch's
	// first document, otherwise bumps it. RETURNING yields the value to use.
	// `next_seq` holds the NEXT value to assign; we return it then advance.
	const [row] = await tx
		.insert(branchNumberSequences)
		.values({ branchNodeId, docType, nextSeq: 2 })
		.onConflictDoUpdate({
			target: [
				branchNumberSequences.branchNodeId,
				branchNumberSequences.docType,
			],
			set: {
				nextSeq: sql`${branchNumberSequences.nextSeq} + 1`,
				updatedAt: new Date(),
			},
		})
		.returning({ nextSeq: branchNumberSequences.nextSeq });

	// On INSERT the row is created with nextSeq=2, so the number just assigned
	// is 1. On UPDATE the returned nextSeq is the freshly-incremented value, so
	// the number assigned is (nextSeq - 1). Both cases: assigned = nextSeq - 1.
	const assigned = (row?.nextSeq ?? 2) - 1;
	return `${prefix}${String(assigned).padStart(SEQ_PAD, "0")}`;
}
