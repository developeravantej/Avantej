import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useForm } from "@tanstack/react-form";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Label } from "@/components/ui/label";
import z from "zod";

export default function SignupForm({
	className,
	...props
}: React.HTMLAttributes<HTMLDivElement>) {
	const navigate = useNavigate();
	const { isPending } = authClient.useSession();

	const form = useForm({
		defaultValues: {
			name: "",
			email: "",
			password: "",
		},
		onSubmit: async ({ value }) => {
			try {
				await authClient.signUp.email(
					{
						email: value.email,
						password: value.password,
						name: value.name,
					},
					{
						onSuccess: () => {
							toast.success("Sign up successful");
							navigate({ to: "/dashboard" });
						},
						onError: (error) => {
							toast.error(error.error.message || error.error.statusText);
						},
					}
				);
			} catch (error: any) {
				console.error("Signup error:", error);
				toast.error(error.message || "Signup failed");
			}
		},
		validators: {
			onSubmit: z.object({
				name: z.string().min(2, "Name must be at least 2 characters"),
				email: z.string().email("Invalid email address"),
				password: z.string().min(8, "Password must be at least 8 characters"),
			}),
		},
	});

	return (
		<div className={cn("mx-auto w-full max-w-md", className)} {...props}>
			<div className="mb-6 text-center">
				<h1 className="text-3xl font-bold">Create Account</h1>
			</div>

			<form
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					form.handleSubmit();
				}}
				className="space-y-4"
			>
				<div>
					<form.Field name="name">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor={field.name}>Name</Label>
								<Input
									id={field.name}
									name={field.name}
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
									disabled={isPending}
								/>
								{field.state.meta.errors.map((error) => (
									<p key={error} className="text-sm text-destructive">
										{error}
									</p>
								))}
							</div>
						)}
					</form.Field>
				</div>

				<div>
					<form.Field name="email">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor={field.name}>Email</Label>
								<Input
									id={field.name}
									name={field.name}
									type="email"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
									disabled={isPending}
								/>
								{field.state.meta.errors.map((error) => (
									<p key={error} className="text-sm text-destructive">
										{error}
									</p>
								))}
							</div>
						)}
					</form.Field>
				</div>

				<div>
					<form.Field name="password">
						{(field) => (
							<div className="space-y-2">
								<Label htmlFor={field.name}>Password</Label>
								<Input
									id={field.name}
									name={field.name}
									type="password"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
									disabled={isPending}
								/>
								{field.state.meta.errors.map((error) => (
									<p key={error} className="text-sm text-destructive">
										{error}
									</p>
								))}
							</div>
						)}
					</form.Field>
				</div>

				<form.Subscribe>
					{(state) => (
						<Button
							type="submit"
							className="w-full"
							disabled={!state.canSubmit || state.isSubmitting || isPending}
						>
							{state.isSubmitting ? "Submitting..." : "Sign Up"}
						</Button>
					)}
				</form.Subscribe>
			</form>

			<div className="mt-4 text-center text-sm">
				Already have an account?{" "}
				<Link to="/login" className="underline underline-offset-4">
					Sign In
				</Link>
			</div>
		</div>
	);
}




