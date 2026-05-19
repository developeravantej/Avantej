import { PauseCircle } from "lucide-react";
import { MagicLinkActions } from "@/components/customers/customer-360/magic-link-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getInitials, memberStatusVariant, formatDate } from "../utils";

type Member = {
	status: string | null;
	joinedAt: Date | string | null;
};

type User = {
	name: string | null;
	email: string | null;
};

type Profile = {
	id?: string | null;
	phone?: string | null;
} | null;

type Props = {
	member: Member;
	user: User;
	profile: Profile;
	organizationId?: string | null;
	canFreeze: boolean;
	canShowFreezeButton: boolean;
	onFreezeClick: () => void;
};

export function CustomerHeader({
	member,
	user,
	profile,
	organizationId,
	canFreeze,
	canShowFreezeButton,
	onFreezeClick,
}: Props) {
	const initials = getInitials(user.name ?? "?");
	return (
		<div className="flex items-start gap-4">
			<span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary text-xl">
				{initials}
			</span>
			<div className="min-w-0 flex-1 space-y-1">
				<div className="flex flex-wrap items-center gap-2">
					<h1 className="text-2xl leading-tight">{user.name}</h1>
					<Badge variant={memberStatusVariant(member.status ?? "")}>
						{member.status ?? "unknown"}
					</Badge>
				</div>
				<p className="text-muted-foreground text-sm">{user.email}</p>
				{profile?.phone && (
					<p className="text-muted-foreground text-sm">{profile.phone}</p>
				)}
				<p className="text-muted-foreground text-xs">
					Joined {formatDate(member.joinedAt)}
				</p>
				{organizationId && profile?.id && (
					<div className="pt-2">
						<MagicLinkActions
							organizationId={organizationId}
							customerProfileId={profile.id}
							customerEmail={user.email}
						/>
					</div>
				)}
			</div>
			<div className="flex shrink-0 items-start gap-2">
				{canFreeze && canShowFreezeButton && (
					<Button variant="outline" size="sm" onClick={onFreezeClick}>
						<PauseCircle className="mr-1.5 size-4" />
						Pause Membership
					</Button>
				)}
			</div>
		</div>
	);
}
