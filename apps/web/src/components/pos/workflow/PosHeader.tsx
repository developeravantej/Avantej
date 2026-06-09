import { ArrowLeft, ShoppingCart } from "lucide-react";
import { Link } from "@tanstack/react-router";

interface PosHeaderProps {
	today: string;
}

export function PosHeader({ today }: PosHeaderProps) {
	return (
		<div className="flex items-end justify-between border-b border-[#e5e5e5] bg-[#f3f3f3] px-6 pb-4 pt-5">
			<div className="flex items-end gap-4">
				<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0a0a0a] text-white">
					<ShoppingCart className="h-5 w-5" />
				</div>
				<div>
					<p className="text-[10px] font-bold uppercase tracking-widest text-[#737373]">
						Point of Sale
					</p>
					<h1 className="text-[28px] font-extrabold leading-none tracking-tight text-[#0a0a0a]">
						New Sale
					</h1>
					<p className="mt-0.5 text-sm text-[#737373]">{today}</p>
				</div>
			</div>
			<div className="flex items-center gap-2 pb-1">
				<Link to="/dashboard/sales/view">
					<button
						type="button"
						className="flex items-center gap-1.5 rounded-[10px] border border-[#e5e5e5] bg-white px-3.5 py-2 text-[13px] font-semibold text-[#0a0a0a] transition-colors hover:bg-[#f3f3f3]"
					>
						<ArrowLeft className="h-3.5 w-3.5" />
						Sales
					</button>
				</Link>
			</div>
		</div>
	);
}
