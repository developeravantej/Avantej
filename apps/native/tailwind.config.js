import { hairlineWidth } from "nativewind/theme";
import { colors } from "./lib/colors";

/** @type {import('tailwindcss').Config} */
export const darkMode = "class";
export const content = [
	"./app/**/*.{js,ts,tsx}",
	"./components/**/*.{js,ts,tsx}",
];
export const presets = [require("nativewind/preset")];
export const theme = {
	extend: {
		colors: {
			background: "hsl(var(--background))",
			foreground: "hsl(var(--foreground))",
			card: {
				DEFAULT: "hsl(var(--card))",
				foreground: "hsl(var(--card-foreground))",
			},
			popover: {
				DEFAULT: "hsl(var(--popover))",
				foreground: "hsl(var(--popover-foreground))",
			},
			primary: {
				DEFAULT: "hsl(var(--primary))",
				foreground: "hsl(var(--primary-foreground))",
				// Custom primary colors
				1: colors.primary[1],
				2: colors.primary[2],
				3: colors.primary[3],
			},
			secondary: {
				DEFAULT: "hsl(var(--secondary))",
				foreground: "hsl(var(--secondary-foreground))",
				// Custom secondary colors
				1: colors.secondary[1],
				2: colors.secondary[2],
				3: colors.secondary[3],
			},
			muted: {
				DEFAULT: "hsl(var(--muted))",
				foreground: "hsl(var(--muted-foreground))",
			},
			accent: {
				DEFAULT: "hsl(var(--accent))",
				foreground: "hsl(var(--accent-foreground))",
			},
			destructive: {
				DEFAULT: "hsl(var(--destructive))",
				foreground: "hsl(var(--destructive-foreground))",
			},
			border: "hsl(var(--border))",
			input: "hsl(var(--input))",
			ring: "hsl(var(--ring))",
			radius: "var(--radius)",
		},
		borderRadius: {
			xl: "calc(var(--radius) + 4px)",
			lg: "var(--radius)",
			md: "calc(var(--radius) - 2px)",
			sm: "calc(var(--radius) - 4px)",
		},
		borderWidth: {
			hairline: hairlineWidth(),
		},
	},
};
export const plugins = [];
