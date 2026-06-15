import { CalendarPlus, ShoppingCart, Calendar, BarChart3 } from "lucide-react";
import { Link } from "@tanstack/react-router";

const actions = [
	{
		label: "New Appointment",
		icon: CalendarPlus,
		href: "/dashboard/appointment/view",
		primary: true,
	},
	{
		label: "New Sale",
		icon: ShoppingCart,
		href: "/dashboard/sales/view",
		primary: false,
	},
	{
		label: "Calendar",
		icon: Calendar,
		href: "/dashboard/appointment/view",
		primary: false,
	},
	{
		label: "Reports",
		icon: BarChart3,
		href: "/dashboard/sales/view",
		primary: false,
	},
];

export function QuickActions() {
	return (
		<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
			{actions.map((action) => (
				<Link
					key={action.label}
					to={action.href}
					className={`flex flex-col items-center justify-center gap-2 rounded-xl p-4 transition-colors ${
						action.primary
							? "bg-brand-primary-1 text-white hover:bg-brand-primary-1/90"
							: "border border-brand-secondary-3 bg-card text-brand-primary-1 hover:bg-brand-secondary-3"
					}`}
				>
					<action.icon className="size-6" />
					<span className="text-sm font-medium">{action.label}</span>
				</Link>
			))}
		</div>
	);
}
