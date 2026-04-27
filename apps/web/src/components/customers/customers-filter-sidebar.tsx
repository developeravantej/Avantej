"use client";

import { Search, Users } from "lucide-react";
import { memo } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface CustomerOption {
	id: string;
	name: string;
	email?: string | null;
}

interface CustomersFilterSidebarProps {
	customers: CustomerOption[];
	totalCount: number;
	isLoading?: boolean;
	selectedCustomerId: string | null;
	onSelectCustomer: (customerId: string) => void;
	search: string;
	onSearchChange: (value: string) => void;
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
}: CustomersFilterSidebarProps) {
	return (
		<div className="flex h-full flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
			<div className="shrink-0 border-gray-100 border-b px-4 pt-4 pb-3">
				<div className="mb-3 flex items-center justify-between">
					<div className="flex items-center gap-2">
						<Users className="h-4 w-4 text-gray-500" />
						<span className="font-semibold text-gray-900 text-sm">
							Customers
						</span>
					</div>
					<span className="inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-600 text-xs">
						{totalCount}
					</span>
				</div>
				<div className="relative">
					<Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
					<Input
						placeholder="Search customers..."
						value={search}
						onChange={(e) => onSearchChange(e.target.value)}
						className="h-9 rounded-xl border-gray-200 bg-gray-50 pl-9 text-sm placeholder:text-gray-400 focus:bg-white"
					/>
				</div>
			</div>

			<div className="flex-1 overflow-y-auto px-2 py-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-1">
				{isLoading && (
					<div className="space-y-1.5">
						{[1, 2, 3, 4].map((i) => (
							<div key={i} className="h-12 animate-pulse rounded-xl bg-gray-100" />
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
									"flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors first:mt-0 mt-1",
									isSelected
										? "border-blue-500 border-l-2 bg-blue-50 pl-[calc(0.5rem-2px)]"
										: "hover:bg-gray-50",
								)}
							>
								<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 font-bold text-gray-500 text-xs">
									{getInitials(customer.name) || "?"}
								</div>
								<div className="min-w-0 flex-1">
									<p
										className={cn(
											"truncate font-medium text-sm",
											isSelected ? "text-blue-700" : "text-gray-900",
										)}
									>
										{customer.name}
									</p>
									<p className="truncate text-gray-400 text-xs">
										{customer.email ?? "Customer"}
									</p>
								</div>
							</button>
						);
					})}

				{!isLoading && customers.length === 0 && (
					<div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
						<Users className="h-5 w-5 text-gray-300" />
						<p className="text-muted-foreground text-xs">
							{search ? "No customers match your search." : "No customers found."}
						</p>
					</div>
				)}
			</div>
		</div>
	);
}

export const CustomersFilterSidebar = memo(CustomersFilterSidebarImpl);
