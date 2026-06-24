import { Search, Users } from "lucide-react";
import { memo } from "react";
import { cn } from "@/lib/utils";

interface CustomerOption {
	id: string;
	name: string;
	email?: string | null;
	isDeleted?: boolean | null;
	isUnclaimed?: boolean | null;
}

interface CustomersFilterSidebarProps {
	customers: CustomerOption[];
	totalCount: number;
	isLoading?: boolean;
	selectedCustomerId: string | null;
	onSelectCustomer: (customerId: string) => void;
	search: string;
	onSearchChange: (value: string) => void;
	showDeleted?: boolean;
	onShowDeletedChange?: (value: boolean) => void;
}

function getInitials(name: string) {
	return name
		.split(" ")
		.filter(Boolean)
		.slice(0, 2)
		.map((n) => n[0]?.toUpperCase())
		.join("");
}

function CustomersFilterSidebarImpl({
	customers,
	totalCount,
	isLoading = false,
	selectedCustomerId,
	onSelectCustomer,
	search,
	onSearchChange,
	showDeleted = false,
	onShowDeletedChange,
}: CustomersFilterSidebarProps) {
	return (
		<div className="flex h-full flex-col overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white">
			{/* Header */}
			<div className="shrink-0 border-b border-[#e5e5e5] px-4 pt-4 pb-3">
				<div className="mb-3 flex items-center justify-between">
					<div className="flex items-center gap-2">
						<Users className="h-4 w-4 text-[#737373]" />
						<span className="text-sm font-semibold text-[#0a0a0a]">
							Customers
						</span>
					</div>
					<span className="inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-[#f3f3f3] px-2 py-0.5 font-mono tabular-nums text-[11px] font-medium text-[#737373]">
						{totalCount}
					</span>
				</div>
				{/* Search */}
				<div className="flex items-center gap-2 rounded-xl border border-[#e5e5e5] bg-white px-3 py-2">
					<Search className="h-3.5 w-3.5 shrink-0 text-[#737373]" />
					<input
						placeholder="Search customers…"
						value={search}
						onChange={(e) => onSearchChange(e.target.value)}
						className="flex-1 bg-transparent text-xs outline-none placeholder:text-[#737373] text-[#0a0a0a]"
					/>
				</div>
				{onShowDeletedChange && (
					<label className="mt-2 flex cursor-pointer items-center gap-2 text-[11px] text-[#737373]">
						<input
							type="checkbox"
							checked={showDeleted}
							onChange={(e) => onShowDeletedChange(e.target.checked)}
							data-testid="show-deleted-toggle"
							className="h-3.5 w-3.5 rounded border-[#e5e5e5]"
						/>
						<span>Show deleted</span>
					</label>
				)}
			</div>

			{/* List */}
			<div className="flex-1 overflow-y-auto px-2 py-2 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#e5e5e5]">
				{isLoading && (
					<div className="space-y-1.5">
						{[1, 2, 3, 4].map((i) => (
							<div
								key={i}
								className="h-12 animate-pulse rounded-xl bg-[#f3f3f3]"
							/>
						))}
					</div>
				)}

				{!isLoading &&
					customers.map((customer) => {
						const isSelected = selectedCustomerId === customer.id;
						return (
							<button
								key={customer.id}
								type="button"
								onClick={() => onSelectCustomer(customer.id)}
								className={cn(
									"mt-1 flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition first:mt-0",
									isSelected
										? "bg-[#d6cdb1]/20 border-l-2 border-l-[#0a0a0a] pl-[calc(0.5rem-2px)]"
										: "border-l-2 border-l-transparent hover:bg-[#f3f3f3]",
									customer.isDeleted && "opacity-50",
								)}
							>
								<div
									className={cn(
										"flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
										isSelected
											? "bg-[#0a0a0a] text-white"
											: "bg-[#f3f3f3] text-[#737373]",
									)}
								>
									{getInitials(customer.name) || "?"}
								</div>
								<div className="min-w-0 flex-1">
									<p
										className={cn(
											"truncate text-sm font-semibold",
											isSelected ? "text-[#0a0a0a]" : "text-[#0a0a0a]",
										)}
									>
										{customer.name}
									</p>
									<p className="truncate text-[11px] text-[#737373]">
										{customer.isDeleted
											? "Deleted"
											: customer.isUnclaimed
												? "Unclaimed"
												: (customer.email ?? "Customer")}
									</p>
								</div>
							</button>
						);
					})}

				{!isLoading && customers.length === 0 && (
					<div className="flex flex-col items-center justify-center py-8">
						<Users className="h-5 w-5 text-[#d1d1d1] mb-2" />
						<p className="text-xs font-medium text-[#0a0a0a]">
							{search ? "No matches" : "No customers"}
						</p>
						<p className="mt-1 text-[11px] text-[#737373] text-center">
							{search
								? "Try a different search term."
								: "Invite customers to see them here."}
						</p>
					</div>
				)}
			</div>
		</div>
	);
}

export const CustomersFilterSidebar = memo(CustomersFilterSidebarImpl);
