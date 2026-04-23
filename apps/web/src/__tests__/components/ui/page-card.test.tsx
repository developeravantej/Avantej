import { render } from "@testing-library/react";
import { PageCard } from "@/components/ui/page-card";

describe("PageCard", () => {
	test("default render — div element with rounded-2xl and p-6", () => {
		const { container } = render(<PageCard>Content</PageCard>);
		const el = container.firstChild as HTMLElement;
		expect(el.tagName).toBe("DIV");
		expect(el.className).toContain("rounded-2xl");
		expect(el.className).toContain("p-6");
		expect(el.className).toContain("border-brand-secondary-3");
		expect(el.className).toContain("bg-card");
		expect(el.className).not.toContain("rounded-xl");
	});

	test("nested={true} — uses rounded-xl instead of rounded-2xl", () => {
		const { container } = render(<PageCard nested>Content</PageCard>);
		const el = container.firstChild as HTMLElement;
		expect(el.className).toContain("rounded-xl");
		expect(el.className).not.toContain("rounded-2xl");
	});

	test('padding="compact" — uses p-5', () => {
		const { container } = render(
			<PageCard padding="compact">Content</PageCard>,
		);
		const el = container.firstChild as HTMLElement;
		expect(el.className).toContain("p-5");
		expect(el.className).not.toContain("p-6");
	});

	test('padding="none" — no padding class applied', () => {
		const { container } = render(<PageCard padding="none">Content</PageCard>);
		const el = container.firstChild as HTMLElement;
		expect(el.className).not.toContain("p-6");
		expect(el.className).not.toContain("p-5");
		// p-0 is the class for none padding
		expect(el.className).toContain("p-0");
	});

	test('as="section" — renders a section element', () => {
		const { container } = render(<PageCard as="section">Content</PageCard>);
		const el = container.firstChild as HTMLElement;
		expect(el.tagName).toBe("SECTION");
	});

	test("className prop merges correctly with base classes", () => {
		const { container } = render(
			<PageCard className="custom-extra-class">Content</PageCard>,
		);
		const el = container.firstChild as HTMLElement;
		expect(el.className).toContain("custom-extra-class");
		// Base classes must still be present
		expect(el.className).toContain("rounded-2xl");
		expect(el.className).toContain("border-brand-secondary-3");
	});
});
