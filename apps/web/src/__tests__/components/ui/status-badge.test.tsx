import { render, screen } from "@testing-library/react"
import { StatusBadge, KNOWN_STATUSES } from "@/components/ui/status-badge"

describe("StatusBadge", () => {
	describe("smoke tests — all KNOWN_STATUSES render without throwing", () => {
		for (const status of KNOWN_STATUSES) {
			test(`renders status="${status}"`, () => {
				expect(() => render(<StatusBadge status={status} />)).not.toThrow()
			})
		}
	})

	describe("variant assertions", () => {
		test('status="approved" renders with green styling', () => {
			const { container } = render(<StatusBadge status="approved" />)
			const badge = container.querySelector("[data-slot='badge']")
			expect(badge).toBeTruthy()
			expect(badge?.className).toMatch(/bg-green-50/)
			expect(badge?.className).toMatch(/text-green-700/)
			expect(badge?.className).toMatch(/border-green-300/)
		})

		test('status="rejected" renders with destructive variant', () => {
			const { container } = render(<StatusBadge status="rejected" />)
			const badge = container.querySelector("[data-slot='badge']")
			expect(badge).toBeTruthy()
			// destructive variant applies bg-destructive class
			expect(badge?.className).toMatch(/bg-destructive/)
		})

		test('status="cancelled" renders with destructive variant', () => {
			const { container } = render(<StatusBadge status="cancelled" />)
			const badge = container.querySelector("[data-slot='badge']")
			expect(badge?.className).toMatch(/bg-destructive/)
		})

		test('status="frozen" renders with yellow styling', () => {
			const { container } = render(<StatusBadge status="frozen" />)
			const badge = container.querySelector("[data-slot='badge']")
			expect(badge).toBeTruthy()
			expect(badge?.className).toMatch(/bg-yellow-50/)
			expect(badge?.className).toMatch(/text-yellow-800/)
			expect(badge?.className).toMatch(/border-yellow-300/)
		})

		test('status="inactive" renders with secondary variant', () => {
			const { container } = render(<StatusBadge status="inactive" />)
			const badge = container.querySelector("[data-slot='badge']")
			expect(badge).toBeTruthy()
			// secondary variant applies bg-secondary
			expect(badge?.className).toMatch(/bg-secondary/)
		})

		test('status="paid" renders with blue styling', () => {
			const { container } = render(<StatusBadge status="paid" />)
			const badge = container.querySelector("[data-slot='badge']")
			expect(badge).toBeTruthy()
			expect(badge?.className).toMatch(/bg-blue-50/)
			expect(badge?.className).toMatch(/text-blue-700/)
			expect(badge?.className).toMatch(/border-blue-200/)
		})

		test('status="void" renders with secondary variant (distinct from cancelled)', () => {
			const { container } = render(<StatusBadge status="void" />)
			const badge = container.querySelector("[data-slot='badge']")
			expect(badge?.className).toMatch(/bg-secondary/)
			// void must NOT be destructive
			expect(badge?.className).not.toMatch(/bg-destructive/)
		})
	})

	describe("label prop", () => {
		test("default label is capitalised status with underscores/hyphens replaced by spaces", () => {
			render(<StatusBadge status="in_transit" />)
			expect(screen.getByText("In Transit")).toBeTruthy()
		})

		test('default label for "no-show" is "No Show"', () => {
			render(<StatusBadge status="no-show" />)
			expect(screen.getByText("No Show")).toBeTruthy()
		})

		test('default label for "checked_in" is "Checked In"', () => {
			render(<StatusBadge status="checked_in" />)
			expect(screen.getByText("Checked In")).toBeTruthy()
		})

		test("custom label overrides the default displayed text", () => {
			render(<StatusBadge status="approved" label="Verified" />)
			expect(screen.getByText("Verified")).toBeTruthy()
			expect(screen.queryByText("Approved")).toBeNull()
		})
	})

	describe("className prop", () => {
		test("className is forwarded and merged onto the badge", () => {
			const { container } = render(
				<StatusBadge status="pending" className="my-custom-class" />,
			)
			const badge = container.querySelector("[data-slot='badge']")
			expect(badge?.className).toMatch(/my-custom-class/)
		})

		test("className merges with variant-specific classes", () => {
			const { container } = render(
				<StatusBadge
					status="approved"
					className="extra-border font-bold"
				/>,
			)
			const badge = container.querySelector("[data-slot='badge']")
			expect(badge?.className).toMatch(/bg-green-50/)
			expect(badge?.className).toMatch(/extra-border/)
			expect(badge?.className).toMatch(/font-bold/)
		})
	})

	describe("no-show status (hyphen edge case)", () => {
		test('status="no-show" renders without throwing', () => {
			expect(() => render(<StatusBadge status="no-show" />)).not.toThrow()
		})

		test('status="no-show" uses destructive variant', () => {
			const { container } = render(<StatusBadge status="no-show" />)
			const badge = container.querySelector("[data-slot='badge']")
			expect(badge?.className).toMatch(/bg-destructive/)
		})
	})
})
