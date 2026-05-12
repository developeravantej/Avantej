/**
 * Global font configuration for the application
 * Use these fonts throughout the app for consistent typography
 *
 * @example
 * // In TypeScript/JavaScript:
 * import { fonts } from '@/lib/fonts';
 *
 * <Text style={{ fontFamily: fonts.heading }}>Heading Text</Text>
 * <Text style={{ fontFamily: fonts.subheading }}>Subheading Text</Text>
 * <Text style={{ fontFamily: fonts.body }}>Body Text</Text>
 *
 * @example
 * // In Tailwind classes:
 * <Text className="font-heading">Heading Text</Text>
 * <Text className="font-subheading">Subheading Text</Text>
 * <Text className="font-body">Body Text</Text>
 */

export const fonts = {
	/**
	 * Nordeco - Used for headings and display text
	 */
	heading: "Nordeco",

	/**
	 * Metropolis-Medium - Used for subheadings and medium-weight text
	 */
	subheading: "Metropolis-Medium",

	/**
	 * Plus Jakarta Sans - Used for body text and paragraphs
	 */
	body: "Plus Jakarta Sans",
} as const;

