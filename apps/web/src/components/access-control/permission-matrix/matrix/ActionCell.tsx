import { Check, X, Minus } from "lucide-react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
	parseScopeValue,
	type PermissionScope,
} from "@/hooks/usePermissionMatrixState";
import {
	getScopeButtonStyle,
	getScopeIcon,
} from "./scope-style";

export interface ActionCellProps {
	roleId: string;
	resourceId: string;
	actionId: string;
	hasAccess: boolean;
	scope: PermissionScope | undefined;
	onScopeChange: (
		roleId: string,
		resourceId: string,
		actionId: string,
		enabled: boolean,
		scope: PermissionScope | null,
	) => void;
}

/**
 * Single (role × action) cell in the desktop matrix. Owns the scope-change
 * Select; delegates the mutation call through `onScopeChange` to the consumer.
 */
export function ActionCell({
	roleId,
	resourceId,
	actionId,
	hasAccess,
	scope,
	onScopeChange,
}: ActionCellProps) {
	return (
		<div className="flex items-center justify-center">
			<Select
				value={hasAccess ? scope || "null" : "null"}
				onValueChange={(value) => {
					const { enabled, scope: next } = parseScopeValue(value);
					onScopeChange(roleId, resourceId, actionId, enabled, next);
				}}
			>
				<SelectTrigger
					className={cn(
						"h-8 px-2 py-0 flex items-center justify-between",
						"w-fit text-xs rounded-full",
						hasAccess
							? getScopeButtonStyle(scope)
							: "bg-brand-secondary-3 hover:bg-brand-secondary-3",
						"focus:ring-0 focus:ring-offset-0",
					)}
					aria-label="Select permission scope"
					showIcon={false}
				>
					<div className="flex items-center gap-1">
						<div
							className={cn(
								"w-5 h-5 rounded-full flex items-center justify-center",
								hasAccess
									? getScopeButtonStyle(scope).split(" ")[0]
									: "bg-brand-secondary-3",
							)}
						>
							{getScopeIcon(scope)}
						</div>
					</div>
				</SelectTrigger>
				<SelectContent align="center" className="w-52 p-1" sideOffset={5}>
					<SelectItem value="null" className="flex items-center py-1 px-2">
						<div className="flex items-center gap-2 w-full">
							<div className="w-5 h-5 rounded-full bg-brand-secondary-3 flex items-center justify-center">
								<X className="w-3 h-3 text-brand-secondary-1" />
							</div>
							<span>No Access</span>
						</div>
					</SelectItem>
					<SelectItem value="own" className="flex items-center py-1 px-2">
						<div className="flex items-center gap-2 w-full">
							<div className="w-5 h-5 rounded-full bg-yellow-100 flex items-center justify-center">
								<Minus className="w-3 h-3 text-yellow-700" />
							</div>
							<span>Own</span>
						</div>
					</SelectItem>
					<SelectItem value="team" className="flex items-center py-1 px-2">
						<div className="flex items-center gap-2 w-full">
							<div className="w-5 h-5 rounded-full bg-orange-100 flex items-center justify-center">
								<Check className="w-3 h-3 text-orange-700" />
							</div>
							<span>Team</span>
						</div>
					</SelectItem>
					<SelectItem
						value="organization"
						className="flex items-center py-1 px-2"
					>
						<div className="flex items-center gap-2 w-full">
							<div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center">
								<Check className="w-3 h-3 text-green-700" />
							</div>
							<span>Organization</span>
						</div>
					</SelectItem>
					<SelectItem value="country" className="flex items-center py-1 px-2">
						<div className="flex items-center gap-2 w-full">
							<div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center">
								<Check className="w-3 h-3 text-blue-700" />
							</div>
							<span>Country</span>
						</div>
					</SelectItem>
					<SelectItem value="region" className="flex items-center py-1 px-2">
						<div className="flex items-center gap-2 w-full">
							<div className="w-5 h-5 rounded-full bg-purple-100 flex items-center justify-center">
								<Check className="w-3 h-3 text-purple-700" />
							</div>
							<span>Region</span>
						</div>
					</SelectItem>
					<SelectItem value="area" className="flex items-center py-1 px-2">
						<div className="flex items-center gap-2 w-full">
							<div className="w-5 h-5 rounded-full bg-teal-100 flex items-center justify-center">
								<Check className="w-3 h-3 text-teal-700" />
							</div>
							<span>Area</span>
						</div>
					</SelectItem>
					<SelectItem value="branch" className="flex items-center py-1 px-2">
						<div className="flex items-center gap-2 w-full">
							<div className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center">
								<Check className="w-3 h-3 text-indigo-700" />
							</div>
							<span>Branch</span>
						</div>
					</SelectItem>
				</SelectContent>
			</Select>
		</div>
	);
}
