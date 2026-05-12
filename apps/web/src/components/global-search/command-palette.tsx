import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { client } from "@/utils/orpc";
import { useUserContext } from "@/hooks/useUserContext";
import { useDebounce } from "@/hooks/useDebounce";

interface CommandPaletteProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

// Inferred from customerDirectory.list return shape
interface CustomerRow {
	memberId: string;
	name: string;
	email: string;
}

// Inferred from members.list return shape
interface MemberRow {
	id: string;
	userId: string;
	role: string;
	status: string;
	name: string;
	email: string;
}

// Inferred from salesOrders.list return shape (Drizzle schema fields)
interface SaleRow {
	id: string;
	salesOrderNumber: string;
	customerName: string;
	status: string;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
	const navigate = useNavigate();
	const [query, setQuery] = useState("");
	const debouncedQuery = useDebounce(query, 300);

	const { data: userCtx } = useUserContext();
	const organizationId = userCtx?.currentOrganizationId ?? "";

	// Reset query when dialog closes
	useEffect(() => {
		if (!open) setQuery("");
	}, [open]);

	const isQueryReady = debouncedQuery.length >= 2;

	// Customers — server-side search
	const { data: customerResults } = useQuery({
		queryKey: ["customerDirectory", organizationId, "search", debouncedQuery],
		queryFn: () =>
			organizationId && isQueryReady
				? client.customerDirectory.list({
						organizationId,
						search: debouncedQuery,
						limit: 5,
					})
				: Promise.resolve({ rows: [] as CustomerRow[], total: 0 }),
		enabled: !!organizationId && isQueryReady,
		staleTime: 0,
	});

	// Members — client-side filter (cached, rarely changes)
	const { data: allMembers } = useQuery({
		queryKey: ["members", organizationId],
		queryFn: () =>
			organizationId
				? (client.members.list({ organizationId }) as Promise<MemberRow[]>)
				: Promise.resolve([] as MemberRow[]),
		enabled: !!organizationId,
		staleTime: 60_000,
	});

	// Sales orders — client-side filter (no search param on the API)
	const { data: allSales } = useQuery({
		queryKey: ["salesOrders", organizationId],
		queryFn: () =>
			organizationId
				? (client.salesOrders.list({ organizationId }) as unknown as Promise<SaleRow[]>)
				: Promise.resolve([] as SaleRow[]),
		enabled: !!organizationId,
		staleTime: 60_000,
	});

	const customerRows: CustomerRow[] = isQueryReady
		? (customerResults?.rows ?? []).slice(0, 5)
		: [];

	const filteredMembers: MemberRow[] = isQueryReady
		? (allMembers ?? [])
				.filter((m) => {
					const lq = debouncedQuery.toLowerCase();
					return (
						m.name.toLowerCase().includes(lq) ||
						m.email.toLowerCase().includes(lq)
					);
				})
				.slice(0, 5)
		: [];

	const filteredSales: SaleRow[] = isQueryReady
		? (allSales ?? [])
				.filter((s) => {
					const lq = debouncedQuery.toLowerCase();
					return (
						s.salesOrderNumber.toLowerCase().includes(lq) ||
						s.customerName.toLowerCase().includes(lq)
					);
				})
				.slice(0, 5)
		: [];

	function handleSelectCustomer(row: CustomerRow) {
		navigate({
			to: "/dashboard/customers/$id",
			params: { id: row.memberId },
		});
		onOpenChange(false);
	}

	function handleSelectMember(_m: MemberRow) {
		navigate({ to: "/dashboard/user/view" });
		onOpenChange(false);
	}

	function handleSelectSale(s: SaleRow) {
		navigate({
			to: "/dashboard/sales/$id",
			params: { id: s.id },
		});
		onOpenChange(false);
	}

	const hasResults =
		customerRows.length > 0 ||
		filteredMembers.length > 0 ||
		filteredSales.length > 0;

	return (
		<CommandDialog
			open={open}
			onOpenChange={onOpenChange}
			title="Global Search"
			description="Search across customers, members, and sales orders"
		>
			<CommandInput
				placeholder="Search customers, sales, members..."
				value={query}
				onValueChange={setQuery}
			/>
			<CommandList>
				{!isQueryReady && (
					<div className="py-6 text-center text-sm text-muted-foreground">
						Type at least 2 characters to search
					</div>
				)}
				{isQueryReady && !hasResults && (
					<CommandEmpty>No results found.</CommandEmpty>
				)}
				{customerRows.length > 0 && (
					<CommandGroup heading="Customers">
						{customerRows.map((row) => (
							<CommandItem
								key={row.memberId}
								value={`customer-${row.memberId}`}
								onSelect={() => handleSelectCustomer(row)}
							>
								<span>{row.name}</span>
								<span className="ml-2 text-sm text-muted-foreground">
									{row.email}
								</span>
							</CommandItem>
						))}
					</CommandGroup>
				)}
				{filteredMembers.length > 0 && (
					<CommandGroup heading="Members">
						{filteredMembers.map((m) => (
							<CommandItem
								key={m.id}
								value={`member-${m.id}`}
								onSelect={() => handleSelectMember(m)}
							>
								<span>{m.name !== "Unknown" ? m.name : m.email}</span>
								<span className="ml-2 text-sm text-muted-foreground">
									{m.role}
								</span>
							</CommandItem>
						))}
					</CommandGroup>
				)}
				{filteredSales.length > 0 && (
					<CommandGroup heading="Sales">
						{filteredSales.map((s) => (
							<CommandItem
								key={s.id}
								value={`sale-${s.id}`}
								onSelect={() => handleSelectSale(s)}
							>
								<span>{s.salesOrderNumber}</span>
								<span className="ml-2 text-sm text-muted-foreground">
									{s.customerName}
								</span>
							</CommandItem>
						))}
					</CommandGroup>
				)}
			</CommandList>
		</CommandDialog>
	);
}
