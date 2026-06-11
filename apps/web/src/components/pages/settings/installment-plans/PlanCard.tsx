import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import {
	type InstallmentPlanRow,
	fmtPremium,
	samplePerInstallment,
} from "./types";

export type PlanCardProps = {
	plan: InstallmentPlanRow;
	sampleAmount: number;
	isMutating: boolean;
	onEdit: () => void;
	onSetDefault: () => void;
	onDeactivate: () => void;
};

export function PlanCard({
	plan,
	sampleAmount,
	isMutating,
	onEdit,
	onSetDefault,
	onDeactivate,
}: PlanCardProps) {
	const inactive = !plan.isActive;
	const per = samplePerInstallment(sampleAmount, plan.numInstallments);
	const premium = fmtPremium(plan.pricePremiumBps);
	const totalWithPremium = premium
		? sampleAmount * (1 + plan.pricePremiumBps / 10000)
		: sampleAmount;

	return (
		<div
			className={cn(
				"flex flex-col rounded-xl border border-[#e5e5e5] bg-white p-5",
				inactive && "opacity-60",
			)}
		>
			{/* Card header */}
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0 flex-1">
					{/* Badges row */}
					<div className="flex flex-wrap items-center gap-1.5">
						{/* Active / Inactive badge */}
						<span
							className={cn(
								"inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium",
								plan.isActive
									? "border-green-200 bg-green-50 text-green-700"
									: "border-red-200 bg-red-50 text-red-700",
							)}
						>
							<span
								className={cn(
									"h-1.5 w-1.5 rounded-full",
									plan.isActive ? "bg-green-500" : "bg-red-400",
								)}
							/>
							{plan.isActive ? "Active" : "Inactive"}
						</span>

						{/* Installments count badge */}
						<span className="inline-flex items-center rounded-md border border-[#e5e5e5] bg-[#f3f3f3] px-2 py-0.5 font-mono text-[11px] font-medium tabular-nums text-[#4a4f51]">
							×{plan.numInstallments}
						</span>

						{/* Interval */}
						{plan.numInstallments > 1 && (
							<span className="text-[11px] text-[#6b7170]">
								· {plan.defaultIntervalDays} day interval
							</span>
						)}

						{/* Default star */}
						{plan.isDefault && (
							<span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
								<Star className="h-3 w-3 fill-amber-400 text-amber-400" />
								Default
							</span>
						)}
					</div>

					{/* Plan name */}
					<h4 className="mt-2 text-sm font-semibold text-[#0a0a0a]">
						{plan.name}
					</h4>

					{/* Code */}
					<p className="mt-0.5 font-mono text-[11px] text-[#8a8f91]">
						{plan.code}
					</p>

					{/* Description */}
					{plan.description && (
						<p className="mt-1 line-clamp-2 text-xs text-[#6b7170]">
							{plan.description}
						</p>
					)}
				</div>

				{/* Edit button */}
				<button
					type="button"
					onClick={onEdit}
					disabled={isMutating}
					className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#0a0a0a] transition-colors hover:bg-[#f3f3f3] disabled:cursor-not-allowed disabled:opacity-50"
				>
					Edit
				</button>
			</div>

			{/* Sample math block */}
			<div className="mt-4 rounded-xl border border-[#e5e5e5] bg-[#f3f3f3] p-3">
				<div className="mb-2 text-xs font-medium text-[#6b7170]">
					Sample · RM {sampleAmount.toLocaleString()} sale
					{premium && (
						<span className="ml-1 text-amber-600">
							({premium} premium → RM {totalWithPremium.toFixed(0)})
						</span>
					)}
				</div>

				{plan.numInstallments === 1 ? (
					// Single payment
					<div className="flex items-center gap-2">
						<div className="flex-1 rounded-lg bg-[#000] px-3 py-2 text-center">
							<div className="font-mono text-sm font-bold tabular-nums text-white">
								RM {sampleAmount.toLocaleString()}
							</div>
							<div className="mt-0.5 text-[10px] text-[#8a8f91]">Due today</div>
						</div>
					</div>
				) : plan.numInstallments <= 4 ? (
					// 2–4 installments: show each chip
					<div className="flex flex-wrap items-center gap-1.5">
						{Array.from({ length: plan.numInstallments }).map((_, i) => (
							<div
								key={i}
								className={cn(
									"flex-1 rounded-lg border px-2 py-1.5 text-center",
									i === 0
										? "border-[#000] bg-[#000] text-white"
										: "border-[#e5e5e5] bg-[#f3f3f3]",
								)}
								style={{ minWidth: "3rem" }}
							>
								<div
									className={cn(
										"font-mono text-xs font-bold tabular-nums",
										i === 0 ? "text-white" : "text-[#0a0a0a]",
									)}
								>
									RM {per}
								</div>
								<div
									className={cn(
										"text-[10px]",
										i === 0 ? "text-[#8a8f91]" : "text-[#6b7170]",
									)}
								>
									{i === 0 ? "Today" : `Day ${plan.defaultIntervalDays * i}`}
								</div>
							</div>
						))}
					</div>
				) : (
					// 5+ installments: show "per installment × count" summary
					<div className="flex items-center gap-2">
						<div className="rounded-lg border border-[#e5e5e5] bg-[#f3f3f3] px-3 py-1.5 text-center">
							<div className="font-mono text-sm font-bold tabular-nums text-[#0a0a0a]">
								RM {per}
							</div>
							<div className="text-[10px] text-[#6b7170]">per installment</div>
						</div>
						<span className="font-mono text-xs text-[#6b7170]">×</span>
						<div className="text-xs leading-tight text-[#6b7170]">
							{plan.numInstallments} installments
							<br />
							<span className="font-mono tabular-nums font-medium text-[#0a0a0a]">
								RM {sampleAmount.toLocaleString()}
							</span>{" "}
							total
						</div>
					</div>
				)}
			</div>

			{/* Footer actions */}
			<div className="mt-3 flex items-center gap-1.5">
				{plan.isActive ? (
					<button
						type="button"
						onClick={onDeactivate}
						disabled={isMutating}
						className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
					>
						Disable
					</button>
				) : // Inactive: show no enable button (handled via Edit)
				null}

				{!plan.isDefault && plan.isActive && (
					<button
						type="button"
						onClick={onSetDefault}
						disabled={isMutating}
						className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#6b7170] transition-colors hover:bg-[#f3f3f3] disabled:cursor-not-allowed disabled:opacity-50"
					>
						<Star className="h-3 w-3" />
						Set default
					</button>
				)}
			</div>
		</div>
	);
}
