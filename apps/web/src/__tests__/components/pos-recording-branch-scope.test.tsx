import { describe, expect, it } from "vitest";
import { deriveScopeLeafBranchId } from "@/components/pos/workflow/helpers";
import type { ScopeContextValue } from "@/components/scope/ScopeProvider";

// ─────────────────────────────────────────────────────────────────────────────
// POS recording-branch seed (WRITE path).
//
// POS is special: the scope switcher is NOT a read filter here. The sale records
// under its own explicit per-operation branch. `deriveScopeLeafBranchId` is the
// pure seam PosWorkflow uses to SEED that branch's default from the active scope
// — and ONLY when the active scope is a concrete LEAF BRANCH.
//
// The full PosWorkflow component is too heavy to render in jsdom (live clock
// interval, navigate, ~half a dozen oRPC queries), so we exercise the extracted
// derivation against the FULL useScope contract shape, which is what the
// component reads (`const { scopeNodeId, scopeNodes } = useScope()`).
// ─────────────────────────────────────────────────────────────────────────────

type ScopeNode = ScopeContextValue["scopeNodes"][number];

function node(id: string, type: string): ScopeNode {
	return {
		id,
		name: `${type}:${id}`,
		type,
		depth: type === "branch" ? 2 : 0,
		parentId: null,
		createdAt: null,
		updatedAt: null,
	};
}

// A realistic accessible tree: country → state → branch.
const SCOPE_NODES: ScopeNode[] = [
	node("country-my", "country"),
	node("state-sgr", "state"),
	node("branch-main", "branch"),
	node("branch-pj", "branch"),
];

// Build a FULL useScope contract so the slice we read mirrors production exactly.
function makeScope(scopeNodeId: string | undefined): ScopeContextValue {
	const isAll = scopeNodeId === undefined;
	return {
		scopeNodeId,
		isAllScope: isAll,
		activeScopeId: scopeNodeId ?? "country-my",
		activeScopeNode: scopeNodeId
			? (SCOPE_NODES.find((n) => n.id === scopeNodeId) ?? null)
			: null,
		setActiveScope: () => {},
		resetScope: () => {},
		accessibleNodeIds: SCOPE_NODES.map((n) => n.id),
		scopeNodes: SCOPE_NODES,
		topAccessibleNodeId: "country-my",
		isScopeReady: true,
	};
}

// Mirror of PosWorkflow's resolution order:
//   resolvedBranchId = selectedCustomer?.branchId ?? (scopeLeafSeed ?? memberHome)
// Used to prove the seed only sets the DEFAULT and never overrides a customer.
function resolveRecordingBranch(opts: {
	scope: ScopeContextValue;
	memberHomeBranchId: string | null;
	customerBranchId?: string | null;
}): string | null {
	const seed = deriveScopeLeafBranchId(
		opts.scope.scopeNodeId,
		opts.scope.scopeNodes,
	);
	const defaultBranchId = seed ?? opts.memberHomeBranchId;
	return opts.customerBranchId ?? defaultBranchId;
}

describe("POS recording-branch scope seed", () => {
	it("seeds the recording branch when the active scope is a LEAF branch", () => {
		const scope = makeScope("branch-pj");
		expect(deriveScopeLeafBranchId(scope.scopeNodeId, scope.scopeNodes)).toBe(
			"branch-pj",
		);
	});

	it("does NOT auto-pick on the 'All' scope (scopeNodeId undefined)", () => {
		const scope = makeScope(undefined);
		expect(
			deriveScopeLeafBranchId(scope.scopeNodeId, scope.scopeNodes),
		).toBeNull();
	});

	it("does NOT auto-pick on a non-leaf country scope", () => {
		const scope = makeScope("country-my");
		expect(
			deriveScopeLeafBranchId(scope.scopeNodeId, scope.scopeNodes),
		).toBeNull();
	});

	it("does NOT auto-pick on a non-leaf state scope", () => {
		const scope = makeScope("state-sgr");
		expect(
			deriveScopeLeafBranchId(scope.scopeNodeId, scope.scopeNodes),
		).toBeNull();
	});

	it("returns null defensively when the scoped node id is not in scopeNodes", () => {
		expect(deriveScopeLeafBranchId("ghost-node", SCOPE_NODES)).toBeNull();
	});

	// ── Integration of the seed into PosWorkflow's resolution order ────────────

	it("leaf-branch scope becomes the DEFAULT recording branch over member-home", () => {
		const scope = makeScope("branch-pj");
		expect(
			resolveRecordingBranch({ scope, memberHomeBranchId: "branch-main" }),
		).toBe("branch-pj");
	});

	it("non-leaf scope keeps the member-home default (no silent region/country record)", () => {
		const scope = makeScope("state-sgr");
		expect(
			resolveRecordingBranch({ scope, memberHomeBranchId: "branch-main" }),
		).toBe("branch-main");
	});

	it("'All' scope keeps the member-home default", () => {
		const scope = makeScope(undefined);
		expect(
			resolveRecordingBranch({ scope, memberHomeBranchId: "branch-main" }),
		).toBe("branch-main");
	});

	it("a selected customer's own branch still takes precedence over the scope seed (stays user-confirmable)", () => {
		const scope = makeScope("branch-pj");
		expect(
			resolveRecordingBranch({
				scope,
				memberHomeBranchId: "branch-main",
				customerBranchId: "branch-main",
			}),
		).toBe("branch-main");
	});
});
