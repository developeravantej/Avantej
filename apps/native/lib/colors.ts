/**
 * Global color theme for the application
 * Use these colors throughout the app for consistent theming
 *
 * @example
 * // In TypeScript/JavaScript:
 * import { colors } from '@/lib/colors';
 *
 * const backgroundColor = colors.primary[2]; // #FFFFFF
 * const textColor = colors.primary[1]; // #000000
 *
 * @example
 * // In Tailwind classes:
 * <View className="bg-primary-1 text-primary-2" />
 * <View className="bg-secondary-1 border-secondary-2" />
 *
 * @example
 * // Using helper functions:
 * import { getPrimaryColor, getSecondaryColor } from '@/lib/colors';
 *
 * const color = getPrimaryColor('1'); // #000000
 * const secondaryColor = getSecondaryColor('2'); // #D9D9CA
 */

export const colors = {
	primary: {
		1: "#000000",
		2: "#FFFFFF",
		3: "#F3F3F3",
	},
	secondary: {
		1: "#8A8F91",
		2: "#D9D9CA",
		3: "#EDEDE4",
	},
} as const;

/**
 * Type-safe color access
 */
export type ColorKey = keyof typeof colors;
export type PrimaryColorKey = keyof typeof colors.primary;
export type SecondaryColorKey = keyof typeof colors.secondary;

/**
 * Helper function to get primary color
 */
export const getPrimaryColor = (key: PrimaryColorKey): string => {
	return colors.primary[key];
};

/**
 * Helper function to get secondary color
 */
export const getSecondaryColor = (key: SecondaryColorKey): string => {
	return colors.secondary[key];
};

/**
 * Get color by path (e.g., "primary.1" or "secondary.2")
 */
export const getColor = (path: string): string => {
	const [category, key] = path.split(".");
	if (category === "primary" && key in colors.primary) {
		return colors.primary[key as PrimaryColorKey];
	}
	if (category === "secondary" && key in colors.secondary) {
		return colors.secondary[key as SecondaryColorKey];
	}
	throw new Error(`Color not found: ${path}`);
};
