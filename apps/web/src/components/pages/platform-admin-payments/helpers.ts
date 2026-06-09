export function fmtAmount(minor: number, currency = "usd") {
	return `${(minor / 100).toFixed(2)} ${currency.toUpperCase()}`;
}
