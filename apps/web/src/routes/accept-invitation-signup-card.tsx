import { Mail, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Invitation = { email: string; role: string };

type Props = {
	invitation: Invitation;
	firstName: string;
	setFirstName: (v: string) => void;
	lastName: string;
	setLastName: (v: string) => void;
	phone: string;
	setPhone: (v: string) => void;
	password: string;
	setPassword: (v: string) => void;
	confirmPassword: string;
	setConfirmPassword: (v: string) => void;
	onSubmit: (e: React.FormEvent) => void;
	isPending: boolean;
	onLoginInstead: () => void;
};

export function AcceptInvitationSignupCard({
	invitation,
	firstName,
	setFirstName,
	lastName,
	setLastName,
	phone,
	setPhone,
	password,
	setPassword,
	confirmPassword,
	setConfirmPassword,
	onSubmit,
	isPending,
	onLoginInstead,
}: Props) {
	return (
		<div className="min-h-screen flex items-center justify-center bg-zinc-50 p-4">
			<div className="w-full max-w-md space-y-4">
				<Card>
					<CardHeader className="text-center space-y-2">
						<div className="flex justify-center">
							<div className="rounded-full bg-primary/10 p-3">
								<UserPlus className="size-6 text-primary" />
							</div>
						</div>
						<CardTitle className="text-2xl">You've Been Invited!</CardTitle>
						<CardDescription className="text-base">
							Sign up to join and accept your invitation as a{" "}
							<span className="font-semibold text-primary">
								{invitation.role}
							</span>
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="rounded-lg bg-muted/50 p-4 space-y-2">
							<div className="flex items-center gap-2 text-sm">
								<Mail className="size-4 text-muted-foreground" />
								<span className="text-muted-foreground">Invited email:</span>
								<span className="font-medium">{invitation.email}</span>
							</div>
							<div className="flex items-center gap-2 text-sm">
								<span className="text-muted-foreground">Role:</span>
								<span className="font-medium capitalize">
									{invitation.role}
								</span>
							</div>
						</div>

						<div className="pt-2">
							<p className="text-sm text-muted-foreground mb-4 text-center">
								Create your account to accept this invitation and join the
								organization
							</p>
							<form onSubmit={onSubmit} className="space-y-3">
								<div>
									<Label htmlFor="firstName">First Name</Label>
									<Input
										id="firstName"
										value={firstName}
										onChange={(e) => setFirstName(e.target.value)}
										required
									/>
								</div>
								<div>
									<Label htmlFor="lastName">Last Name</Label>
									<Input
										id="lastName"
										value={lastName}
										onChange={(e) => setLastName(e.target.value)}
										required
									/>
								</div>
								<div>
									<Label htmlFor="email">Email Address</Label>
									<Input
										id="email"
										value={invitation.email}
										readOnly
										className="bg-muted"
									/>
									<p className="text-xs text-muted-foreground mt-1">
										This email is required for this invitation
									</p>
								</div>
								<div>
									<Label htmlFor="phone">
										Phone{" "}
										<span className="text-muted-foreground">(optional)</span>
									</Label>
									<Input
										id="phone"
										type="tel"
										value={phone}
										onChange={(e) => setPhone(e.target.value)}
										placeholder="+60123456789"
										autoComplete="tel"
									/>
								</div>
								<div>
									<Label htmlFor="password">Password</Label>
									<Input
										id="password"
										type="password"
										value={password}
										onChange={(e) => setPassword(e.target.value)}
										required
										minLength={8}
									/>
								</div>
								<div>
									<Label htmlFor="confirmPassword">Confirm Password</Label>
									<Input
										id="confirmPassword"
										type="password"
										value={confirmPassword}
										onChange={(e) => setConfirmPassword(e.target.value)}
										required
										minLength={8}
									/>
								</div>
								<Button type="submit" className="w-full" disabled={isPending}>
									{isPending
										? "Setting up your account…"
										: "Sign Up & Accept Invitation"}
								</Button>
							</form>
						</div>

						<div className="pt-4 border-t">
							<p className="text-sm text-center text-muted-foreground">
								Already have an account?{" "}
								<Button
									variant="link"
									className="h-auto p-0 text-primary"
									onClick={onLoginInstead}
								>
									Log in to accept invitation
								</Button>
							</p>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
