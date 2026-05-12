/**
 * Money formatting helpers.
 *
 * Money values throughout the API are stored as integer CENTS (e.g. RM 80.00
 * is stored as 8000). Always run server values through one of these helpers
 * before displaying.
 *
 * Currency symbol is hardcoded to RM for now. When the API exposes per-org
 * currency config, replace `CURRENCY_SYMBOL` here with a value pulled from
 * the organization context — every screen that uses these helpers will
 * update automatically.
 */

const CURRENCY_SYMBOL = "RM";

/**
 * Format an integer cent value as a currency string.
 *   formatMoney(8000) → "RM 80.00"
 *   formatMoney(null) → "RM 0.00"
 */
export function formatMoney(cents: number | null | undefined): string {
	const value = (cents ?? 0) / 100;
	return `${CURRENCY_SYMBOL} ${value.toFixed(2)}`;
}

