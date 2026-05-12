export function encodeCursor(changedAt: Date, id: string): string {
	return `${changedAt.toISOString()}|${id}`;
}

export function parseCursor(cursor: string): { changedAt: Date; id: string } | null {
	try {
		const sep = cursor.lastIndexOf("|");
		if (sep === -1) return null;
		const changedAt = new Date(cursor.slice(0, sep));
		const id = cursor.slice(sep + 1);
		if (Number.isNaN(changedAt.getTime())) return null;
		if (id.length !== 36) return null;
		return { changedAt, id };
	} catch {
		return null;
	}
}
