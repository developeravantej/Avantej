/**
 * Tenant Service Commission Configuration Schema
 * 
 * Defines how commission is calculated and split among staff for each service.
 * This replaces separate tables for incentive config, payment structure, and staff weightage.
 * 
 * Business Rules:
 * - One commission config per service (1:1 relationship)
 * - Commission type determines calculation method:
 *   - "fixed": Use fixedAmounts map (role -> amount in cents)
 *   - "percentage": Use staffPoolPercentage and positionWeightage
 *   - "position_based": Use positionWeightage array
 * - Position weightage percentages must sum to 100 (enforced in app layer)
 * - Max staff limits how many staff can be assigned to the service
 */

import { pgTable, uuid, text, integer, timestamp, index, jsonb } from "drizzle-orm/pg-core";
import { services } from "./services";

export const serviceCommissionConfig = pgTable("service_commission_config", {
	id: uuid("id").primaryKey().defaultRandom(),
	serviceId: uuid("service_id")
		.notNull()
		.unique()
		.references(() => services.id, { onDelete: "cascade" }),
	
	commissionType: text("commission_type").notNull(), // "fixed" | "percentage" | "position_based"
	
	// Fixed amount configuration (for commissionType = "fixed")
	fixedAmounts: jsonb("fixed_amounts").$type<Record<string, number> | null>(), // JSON: { "role_1": 5000, "role_2": 3000 } in cents
	
	// Percentage-based configuration (for commissionType = "percentage" or "position_based")
	staffPoolPercentage: integer("staff_pool_percentage").default(100).notNull(), // 0-100
	
	// Position-based weightage (for commissionType = "percentage" or "position_based")
	positionWeightage: jsonb("position_weightage").$type<Array<{ position: number; percentage: number; title?: string }> | null>(), // JSON: [{ "position": 1, "percentage": 60 }, { "position": 2, "percentage": 40 }]
	
	maxStaff: integer("max_staff").notNull().default(1),
	
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
	serviceIdIdx: index("service_commission_config_service_idx").on(table.serviceId),
}));

