// ─── SVG Sparkline helper ─────────────────────────────────────────────────────

/**
 * Converts an array of numbers into SVG polyline points within the given
 * viewBox dimensions. Returns both the stroke path and the filled area polygon.
 */
export function buildSparklinePaths(
	values: number[],
	w = 80,
	h = 24,
	padY = 2,
): { line: string; area: string } {
	if (values.length < 2) return { line: `0,${h / 2} ${w},${h / 2}`, area: "" };

	const min = Math.min(...values);
	const max = Math.max(...values);
	const range = max - min || 1;

	const pts = values.map((v, i) => {
		const x = (i / (values.length - 1)) * w;
		const y = padY + (1 - (v - min) / range) * (h - padY * 2);
		return `${x.toFixed(1)},${y.toFixed(1)}`;
	});

	const line = pts.join(" ");
	const first = pts[0];
	const last = pts[pts.length - 1];
	const lastX = last.split(",")[0];
	const area = `${first} ${pts.slice(1).join(" ")} ${lastX},${h} 0,${h}`;
	return { line, area };
}

// ─── Area chart helper for revenue trend ─────────────────────────────────────

export function buildAreaChart(
	values: number[],
	w = 640,
	h = 160,
	padY = 8,
): { line: string; area: string } {
	if (values.length < 2) return { line: "", area: "" };

	const min = 0;
	const max = Math.max(...values, 1);

	const pts = values.map((v, i) => {
		const x = 18 + (i / (values.length - 1)) * (w - 36);
		const y = padY + (1 - (v - min) / (max - min)) * (h - padY * 2);
		return `${x.toFixed(1)},${y.toFixed(1)}`;
	});

	const line = pts.join(" ");
	const lastX = pts[pts.length - 1].split(",")[0];
	const area = `${pts[0]} ${pts.slice(1).join(" ")} ${lastX},${h} 18,${h}`;
	return { line, area };
}
