import type * as React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type TabDef = {
	id: string;
	label: string;
	content: React.ReactNode;
	hidden?: boolean;
};

type ConsolidatedTabsProps = {
	value: string;
	onValueChange: (value: string) => void;
	tabs: TabDef[];
};

export function ConsolidatedTabs({
	value,
	onValueChange,
	tabs,
}: ConsolidatedTabsProps) {
	const visibleTabs = tabs.filter((t) => !t.hidden);
	// Fall back to first visible tab if the active tab is hidden (e.g. permission revoked)
	const activeValue = visibleTabs.some((t) => t.id === value)
		? value
		: (visibleTabs[0]?.id ?? value);

	return (
		<Tabs value={activeValue} onValueChange={onValueChange}>
			<TabsList className="mb-4">
				{visibleTabs.map((tab) => (
					<TabsTrigger key={tab.id} value={tab.id}>
						{tab.label}
					</TabsTrigger>
				))}
			</TabsList>
			{tabs.map((tab) => (
				<TabsContent key={tab.id} value={tab.id}>
					{tab.content}
				</TabsContent>
			))}
		</Tabs>
	);
}
