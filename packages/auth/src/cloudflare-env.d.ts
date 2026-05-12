declare module "cloudflare:workers" {
	export const env: {
		DATABASE_URL: string;
		CORS_ORIGIN: string;
		BETTER_AUTH_SECRET: string;
		BETTER_AUTH_URL: string;
	};
}
