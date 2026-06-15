import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

interface TenantsFiltersProps {
	search: string;
	onSearchChange: (value: string) => void;
	paymentStatus: string;
	onPaymentStatusChange: (value: string) => void;
	countryCode: string;
	onCountryCodeChange: (value: string) => void;
	isLoading: boolean;
	total: number;
}

export function TenantsFilters({
	search,
	onSearchChange,
	paymentStatus,
	onPaymentStatusChange,
	countryCode,
	onCountryCodeChange,
	isLoading,
	total,
}: TenantsFiltersProps) {
	return (
		<div className="flex gap-3 items-center">
			<div className="relative flex-1 max-w-md">
				<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
				<Input
					className="pl-9"
					placeholder="Search name, slug, or owner email"
					value={search}
					onChange={(e) => {
						onSearchChange(e.target.value);
					}}
				/>
			</div>
			<Select
				value={paymentStatus}
				onValueChange={(v) => {
					onPaymentStatusChange(v);
				}}
			>
				<SelectTrigger className="w-48">
					<SelectValue placeholder="Payment status" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="any">Any status</SelectItem>
					<SelectItem value="active">active</SelectItem>
					<SelectItem value="suspended">suspended</SelectItem>
					<SelectItem value="cancelled">cancelled</SelectItem>
					<SelectItem value="failed">failed</SelectItem>
				</SelectContent>
			</Select>
			<Select
				value={countryCode}
				onValueChange={(v) => {
					onCountryCodeChange(v);
				}}
			>
				<SelectTrigger className="w-32">
					<SelectValue placeholder="Country" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="any">Any country</SelectItem>
					<SelectItem value="MY">MY</SelectItem>
					<SelectItem value="SG">SG</SelectItem>
					<SelectItem value="TH">TH</SelectItem>
				</SelectContent>
			</Select>
			<div className="text-sm text-muted-foreground ml-auto">
				{isLoading ? "Loading…" : `${total} tenant${total === 1 ? "" : "s"}`}
			</div>
		</div>
	);
}
