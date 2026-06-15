import { pgTable, text, timestamp, boolean, date } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(), // Required by Better-Auth core, computed as firstName + lastName
	firstName: text("first_name").notNull().default(""),
	lastName: text("last_name").notNull().default(""),
	email: text("email").notNull().unique(),
	emailVerified: boolean("email_verified").notNull(),
	image: text("image"),
	phone: text("phone"),
	idPassportNo: text("id_passport_no"),
	addressType: text("address_type"), // "home" | "work"
	streetAddress: text("street_address"),
	city: text("city"),
	state: text("state"),
	country: text("country"),
	postalCode: text("postal_code"),
	dateOfBirth: date("date_of_birth"),
	emergencyContactName: text("emergency_contact_name"),
	emergencyContactRelationship: text("emergency_contact_relationship"),
	emergencyContactPhone: text("emergency_contact_phone"),
	role: text("role"), // Optional field for Better-Auth admin plugin
	banned: boolean("banned"), // Optional field for Better-Auth admin plugin
	banReason: text("ban_reason"), // Optional field for Better-Auth admin plugin
	banExpires: timestamp("ban_expires"), // Optional field for Better-Auth admin plugin
	createdAt: timestamp("created_at").notNull(),
	updatedAt: timestamp("updated_at").notNull(),
	lastLoginAt: timestamp("last_login_at"),
});

export const session = pgTable("session", {
	id: text("id").primaryKey(),
	expiresAt: timestamp("expires_at").notNull(),
	token: text("token").notNull().unique(),
	createdAt: timestamp("created_at").notNull(),
	updatedAt: timestamp("updated_at").notNull(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	impersonatedBy: text("impersonated_by"), // nullable — set by Better-Auth admin plugin during impersonation
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
	id: text("id").primaryKey(),
	accountId: text("account_id").notNull(),
	providerId: text("provider_id").notNull(),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	idToken: text("id_token"),
	accessTokenExpiresAt: timestamp("access_token_expires_at"),
	refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
	scope: text("scope"),
	password: text("password"),
	createdAt: timestamp("created_at").notNull(),
	updatedAt: timestamp("updated_at").notNull(),
});

export const verification = pgTable("verification", {
	id: text("id").primaryKey(),
	identifier: text("identifier").notNull(),
	value: text("value").notNull(),
	expiresAt: timestamp("expires_at").notNull(),
	createdAt: timestamp("created_at"),
	updatedAt: timestamp("updated_at"),
});

// ── Better-Auth organization plugin tables ────────────────────────────────────
// Managed by the Better-Auth `organization()` plugin (see apps/server
// lib/better-auth.ts). Distinct from the app's own `organizations` /
// `organization_members` tables — these back the plugin's session-level org
// features. Modeled here so the schema-drift gate sees them (they live in the
// control-panel DB); the app reads/writes them only through Better-Auth.

export const organization = pgTable("organization", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	slug: text("slug").notNull(),
	logo: text("logo"),
	metadata: text("metadata"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const member = pgTable("member", {
	id: text("id").primaryKey(),
	organizationId: text("organization_id")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	role: text("role").notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const invitation = pgTable("invitation", {
	id: text("id").primaryKey(),
	organizationId: text("organization_id")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
	email: text("email").notNull(),
	role: text("role").notNull(),
	status: text("status").default("pending").notNull(),
	teamId: text("team_id"),
	inviterId: text("inviter_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	expiresAt: timestamp("expires_at").notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});
