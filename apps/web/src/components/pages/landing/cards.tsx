import type { LucideIcon } from "lucide-react";

export function FeatureCard({
	icon: Icon,
	title,
	description,
}: {
	icon: LucideIcon;
	title: string;
	description: string;
}) {
	return (
		<div className="p-6 bg-white rounded-lg shadow-md border border-zinc-100 hover:shadow-lg transition-shadow">
			<div className="size-12 bg-black/5 rounded-lg flex items-center justify-center mb-4">
				<Icon className="size-6 text-black" />
			</div>
			<h3 className="text-xl font-semibold mb-2">{title}</h3>
			<p className="text-zinc-600">{description}</p>
		</div>
	);
}

export function StatCard({ number, label }: { number: string; label: string }) {
	return (
		<div className="text-center">
			<div className="text-4xl font-bold mb-2">{number}</div>
			<div className="text-zinc-600">{label}</div>
		</div>
	);
}

export function TestimonialCard({
	quote,
	author,
	role,
	company,
}: {
	quote: string;
	author: string;
	role: string;
	company: string;
}) {
	return (
		<div className="bg-white p-6 rounded-lg shadow-md">
			<p className="text-zinc-600 italic mb-4">"{quote}"</p>
			<div className="font-semibold">{author}</div>
			<div className="text-sm text-zinc-500">
				{role} at {company}
			</div>
		</div>
	);
}
