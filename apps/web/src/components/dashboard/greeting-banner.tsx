import { useUserContext } from "@/hooks/useUserContext";
import { Bell } from "lucide-react";
import { Link } from "@tanstack/react-router";

function getGreeting(): string {
	const hour = new Date().getHours();
	if (hour < 12) return "Good Morning";
	if (hour < 17) return "Good Afternoon";
	return "Good Evening";
}

function formatDate(): string {
	return new Date().toLocaleDateString("en-MY", {
		weekday: "long",
		month: "long",
		day: "numeric",
	});
}

export function GreetingBanner() {
	const { data: userCtx } = useUserContext();
	const name = userCtx?.user?.name?.split(" ")[0] ?? "there";

	return (
		<div className="flex items-center justify-between rounded-2xl border border-brand-secondary-3 bg-card p-6">
			<div className="flex items-center gap-4">
				<div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-secondary-2">
					<span className="font-heading text-xl font-bold text-brand-primary-1">
						{name[0]?.toUpperCase()}
					</span>
				</div>
				<div>
					<h1 className="font-heading text-3xl font-bold text-brand-primary-1">
						{getGreeting()}, {name}
					</h1>
					<p className="text-sm text-brand-secondary-1">{formatDate()}</p>
				</div>
			</div>
			<Link
				to="/dashboard/notifications/view"
				className="relative rounded-full p-2 transition-colors hover:bg-brand-secondary-3"
				aria-label="Notifications"
			>
				<Bell className="h-6 w-6 text-brand-primary-1" />
			</Link>
		</div>
	);
}
