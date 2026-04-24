import { describe, expect, it } from "vitest";
import {
	actionsColumn,
	dateColumn,
	moneyColumn,
	statusBadgeColumn,
} from "@/lib/table-columns";

describe("table-columns builders (shape)", () => {
	it("moneyColumn sets id/header/accessorFn/cell", () => {
		const col = moneyColumn<{ total: number }>({
			id: "total",
			header: "Total",
			accessor: (r) => r.total,
		});
		expect(col.id).toBe("total");
		expect(col.header).toBe("Total");
		expect(typeof col.cell).toBe("function");
		expect(typeof (col as { accessorFn: unknown }).accessorFn).toBe("function");
	});

	it("dateColumn handles null accessor output", () => {
		const col = dateColumn<{ createdAt: Date | null }>({
			id: "createdAt",
			header: "Created",
			accessor: (r) => r.createdAt,
		});
		expect(col.id).toBe("createdAt");
		expect(typeof col.cell).toBe("function");
	});

	it("actionsColumn defaults id to 'actions' and disables sorting", () => {
		const col = actionsColumn<{ id: string }>({
			actions: () => [{ label: "Edit", onClick: () => {} }],
		});
		expect(col.id).toBe("actions");
		expect(col.enableSorting).toBe(false);
	});

	it("statusBadgeColumn maps variant via variants map", () => {
		const col = statusBadgeColumn<{ status: string }>({
			id: "status",
			header: "Status",
			accessor: (r) => r.status,
			variants: { active: "default", cancelled: "destructive" },
		});
		expect(col.id).toBe("status");
		expect(typeof col.cell).toBe("function");
	});
});
