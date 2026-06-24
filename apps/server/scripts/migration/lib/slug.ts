/** kebab-case slug for hierarchy_nodes.slug (NOT NULL; sibling-unique). */
export function slugify(name: string): string {
	return (
		name
			.toLowerCase()
			.trim()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 60) || "node"
	);
}
