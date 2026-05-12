import { colors } from "./colors";

export const NAV_THEME = {
	light: {
		background: colors.primary[2], // #FFFFFF
		border: colors.secondary[3], // #EDEDE4
		card: colors.primary[2], // #FFFFFF
		notification: "hsl(0 84.2% 60.2%)",
		primary: colors.primary[1], // #000000
		text: colors.primary[1], // #000000
	},
	dark: {
		background: colors.primary[1], // #000000
		border: colors.secondary[1], // #8A8F91
		card: colors.primary[1], // #000000
		notification: "hsl(0 72% 51%)",
		primary: colors.primary[2], // #FFFFFF
		text: colors.primary[2], // #FFFFFF
	},
};

// Re-export colors for global access
export { colors } from "./colors";
