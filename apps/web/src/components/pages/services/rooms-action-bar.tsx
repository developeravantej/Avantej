import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

const ACTIVE_TABS = [
	{ label: "Active", value: true as boolean | undefined },
	{ label: "All", value: undefined as boolean | undefined },
	{ label: "Inactive", value: false as boolean | undefined },
];

type Props = {
	activeFilter: boolean | undefined;
	setActiveFilter: (v: boolean | undefined) => void;
	canCreate: boolean;
	onCreate: () => void;
};

export function RoomsActionBar({
	activeFilter,
	setActiveFilter,
	canCreate,
	onCreate,
}: Props) {
	return (
		<div className="flex shrink-0 items-center justify-between px-6 pt-4 pb-2">
			<div className="flex items-end gap-0">
				{ACTIVE_TABS.map((tab) => {
					const isSelected = activeFilter === tab.value;
					return (
						<button
							key={tab.label}
							type="button"
							onClick={() => setActiveFilter(tab.value)}
							className={`px-3 pb-1.5 text-sm font-medium border-b-2 transition-colors ${
								isSelected
									? "border-foreground text-foreground"
									: "border-transparent text-muted-foreground hover:text-foreground"
							}`}
						>
							{tab.label}
						</button>
					);
				})}
			</div>
			{canCreate && (
				<Button size="sm" onClick={onCreate}>
					<Plus className="mr-2 size-4" />
					Create Room
				</Button>
			)}
		</div>
	);
}
