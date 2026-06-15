#!/usr/bin/env node
// Generate module-grouped smoke specs for every dashboard page + merge their
// journey steps into _e2e/journey-steps.json (preserving hand-written entries,
// e.g. the core interaction journeys).
//
//   node _e2e/gen-smoke.mjs
//
// Each module gets _e2e/web/<module>/smoke.spec.ts with one test per page.
// Smoke tests are READ-ONLY: navigate + assert the route renders without
// crashing into the ErrorBoundary and stays authenticated.
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url)); // _e2e/
const WEB = join(ROOT, "web");

// module -> [{ name(file basename, optional), path, title }]
// Platform-admin pages are excluded (super-admin audience, separate auth).
// Dynamic $id routes are exercised via the core journeys, not smoke.
const MANIFEST = {
	home: [
		{ path: "/dashboard", title: "Dashboard home loads with KPIs/widgets" },
	],
	"access-control": [
		{
			path: "/dashboard/access-control/user-assignment",
			title: "User assignment (Staff Access) loads",
		},
		{ path: "/dashboard/access-control/roles", title: "Roles tab loads" },
		{
			path: "/dashboard/access-control/permissions",
			title: "Permissions tab loads",
		},
		{
			path: "/dashboard/access-control/invitations",
			title: "Invitations loads",
		},
	],
	announcements: [
		{
			path: "/dashboard/announcements/view",
			title: "Announcements list loads",
		},
	],
	appointment: [
		{
			path: "/dashboard/appointment/view",
			title: "Appointments calendar/list loads",
		},
		{
			path: "/dashboard/appointment/class-slots/view",
			title: "Class slots loads",
		},
	],
	attendance: [
		{ path: "/dashboard/attendance/view", title: "Attendance loads" },
	],
	audit: [{ path: "/dashboard/audit/view", title: "Audit log loads" }],
	branch: [
		{ path: "/dashboard/branch/view", title: "Branch list loads" },
		{ path: "/dashboard/branch/create", title: "Create-branch form loads" },
	],
	brands: [{ path: "/dashboard/brands/view", title: "Brands list loads" }],
	"cancelled-sales": [
		{ path: "/dashboard/cancelled-sales/view", title: "Cancelled sales loads" },
	],
	categories: [
		{ path: "/dashboard/categories/view", title: "Categories loads" },
	],
	commissions: [
		{ path: "/dashboard/commissions/my", title: "My commissions loads" },
		{ path: "/dashboard/commissions/view", title: "All commissions loads" },
	],
	customers: [
		{ path: "/dashboard/customers/v2/view", title: "Customers list loads" },
		{
			path: "/dashboard/customers/walk-in/view",
			title: "Walk-in customers loads",
		},
	],
	expenses: [{ path: "/dashboard/expenses/view", title: "Expenses loads" }],
	"inventory-options": [
		{ path: "/dashboard/inventory-options", title: "Inventory options loads" },
	],
	memberships: [
		{ path: "/dashboard/memberships/view", title: "Memberships loads" },
	],
	"my-services": [
		{ path: "/dashboard/my-services/view", title: "My services loads" },
	],
	notifications: [
		{ path: "/dashboard/notifications/view", title: "Notifications loads" },
	],
	onboarding: [
		{ path: "/dashboard/onboarding/view", title: "Onboarding loads" },
	],
	operations: [
		{
			path: "/dashboard/operations/approvals",
			title: "Operations approvals loads",
		},
	],
	packages: [
		{ path: "/dashboard/packages/view", title: "Packages list loads" },
		{
			path: "/dashboard/packages/instances/view",
			title: "Package instances loads",
		},
		{
			path: "/dashboard/packages/installments/view",
			title: "Installments loads",
		},
	],
	payment: [{ path: "/dashboard/payment/view", title: "Payments loads" }],
	products: [{ path: "/dashboard/products/view", title: "Products loads" }],
	promotions: [
		{ path: "/dashboard/promotions/view", title: "Promotions loads" },
	],
	"purchase-orders": [
		{ path: "/dashboard/purchase-orders/view", title: "Purchase orders loads" },
	],
	refunds: [{ path: "/dashboard/refunds/view", title: "Refunds loads" }],
	reports: [{ path: "/dashboard/reports/view", title: "Reports loads" }],
	role: [
		{
			path: "/dashboard/role/view",
			title: "Legacy role route redirects + loads",
		},
	],
	rooms: [
		{
			path: "/dashboard/rooms/view",
			title: "Legacy rooms route redirects + loads",
		},
	],
	sales: [
		{ path: "/dashboard/sales/view", title: "Sales list loads" },
		{ path: "/dashboard/sales/create", title: "POS create page loads" },
	],
	service: [{ path: "/dashboard/service/view", title: "Services loads" }],
	"service-category": [
		{
			path: "/dashboard/service-category/view",
			title: "Service categories loads",
		},
	],
	settings: [
		{
			path: "/dashboard/settings/organization",
			title: "Organization settings loads",
		},
		{
			path: "/dashboard/settings/commission-cycles",
			title: "Commission cycles settings loads",
		},
		{
			path: "/dashboard/settings/installment-plans",
			title: "Installment plans settings loads",
		},
		{
			path: "/dashboard/settings/notifications",
			title: "Notification settings loads",
		},
		{
			path: "/dashboard/settings/google-calendar",
			title: "Google Calendar settings loads",
		},
		{
			path: "/dashboard/settings/tax-rates",
			title: "Tax rates settings loads",
		},
	],
	"stock-requests": [
		{ path: "/dashboard/stock-requests/view", title: "Stock requests loads" },
	],
	suppliers: [{ path: "/dashboard/suppliers/view", title: "Suppliers loads" }],
	trainers: [
		{ path: "/dashboard/trainers/view", title: "Trainers list loads" },
		{
			path: "/dashboard/trainers/availability",
			title: "Trainer availability loads",
		},
		{ path: "/dashboard/trainers/tiers", title: "Trainer tiers loads" },
	],
	"transfer-orders": [
		{ path: "/dashboard/transfer-orders/view", title: "Transfer orders loads" },
	],
	uom: [{ path: "/dashboard/uom/view", title: "Units of measure loads" }],
	"uom-conversions": [
		{ path: "/dashboard/uom-conversions/view", title: "UOM conversions loads" },
	],
	user: [{ path: "/dashboard/user/view", title: "User profile loads" }],
};

const specHeader = `import { test } from "@playwright/test";
import { smokeLoad } from "../_helpers";

// AUTO-GENERATED by _e2e/gen-smoke.mjs — do not edit by hand.
// Read-only page-load smoke: navigate + assert the route renders without
// crashing and stays authenticated.
`;

const steps = (title, path) => [
	`Start logged-in as the tenant admin (franchisee@gmail.com).`,
	`Navigate to ${path}.`,
	`Wait for the dashboard shell (sidebar) to mount, with reload-resilience for cold starts.`,
	`Assert the route did not bounce to /login and did not crash into the "Something went wrong" ErrorBoundary.`,
	`Confirm page content (a heading) painted — ${title.replace(/ loads$/, "").replace(/ loads /, " ")}.`,
];

// merge journeys (preserve any non-smoke / hand-written keys)
const journeyPath = join(ROOT, "journey-steps.json");
let journeys = {};
if (existsSync(journeyPath)) {
	try {
		journeys = JSON.parse(readFileSync(journeyPath, "utf8"));
	} catch {}
}

let fileCount = 0;
let testCount = 0;
for (const [mod, pages] of Object.entries(MANIFEST)) {
	const dir = join(WEB, mod);
	mkdirSync(dir, { recursive: true });
	const relpath = `${mod}/smoke.spec.ts`;
	const body = pages
		.map(
			(p) =>
				`\ttest(${JSON.stringify(p.title)}, async ({ page }) => {\n\t\tawait smokeLoad(page, ${JSON.stringify(p.path)});\n\t});`,
		)
		.join("\n\n");
	const content = `${specHeader}\ntest.describe(${JSON.stringify(mod)}, () => {\n${body}\n});\n`;
	writeFileSync(join(dir, "smoke.spec.ts"), content);
	fileCount++;
	for (const p of pages) {
		journeys[`${relpath}::${p.title}`] = steps(p.title, p.path);
		testCount++;
	}
}

writeFileSync(journeyPath, JSON.stringify(journeys, null, 2) + "\n");
console.log(
	`Wrote ${fileCount} smoke spec files, ${testCount} smoke tests; merged journeys -> ${journeyPath} (${Object.keys(journeys).length} total entries)`,
);
