import type { NodeWithStats } from "./types";

// ─── Breadcrumb path builder ───────────────────────────────────────────────

export function buildBreadcrumb(
	nodeId: string,
	nodeById: Map<string, NodeWithStats>,
): string[] {
	const parts: string[] = [];
	let current: NodeWithStats | undefined = nodeById.get(nodeId);
	while (current) {
		parts.unshift(current.name);
		current = current.parentId ? nodeById.get(current.parentId) : undefined;
	}
	return parts;
}

// ─── Tree builder ──────────────────────────────────────────────────────────────

export function buildTree(
	nodes: NodeWithStats[],
): Map<string | null, NodeWithStats[]> {
	const map = new Map<string | null, NodeWithStats[]>();
	for (const node of nodes) {
		const key = node.parentId ?? null;
		if (!map.has(key)) map.set(key, []);
		map.get(key)!.push(node);
	}
	return map;
}
