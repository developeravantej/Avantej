import { createFileRoute } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { z } from "zod";
import { toast } from "sonner";
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
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/demo")({
	component: DemoPage,
});

const demoSchema = z.object({
	name: z.string().min(2, "Name must be at least 2 characters"),
	email: z.string().email("Please enter a valid email"),
	company: z.string().optional(),
	message: z.string().optional(),
});

type DemoForm = z.infer<typeof demoSchema>;

function FieldError({ errors }: { errors: unknown[] }) {
	if (errors.length === 0) return null;
	return (
		<>
			{errors.map((error, i) => (
				<p key={i} className="text-sm text-destructive">
					{typeof error === "string"
						? error
						: (error as { message?: string })?.message || "Invalid value"}
				</p>
			))}
		</>
	);
}

function DemoPage() {
	const form = useForm({
		defaultValues: {
			name: "",
			email: "",
			company: "",
			message: "",
		} as DemoForm,
		validators: { onSubmit: demoSchema },
		onSubmit: async ({ value }) => {
			const bodyLines = [
				`From: ${value.name} (${value.email})`,
				value.company ? `Company: ${value.company}` : null,
				"",
				value.message || "I would like to request a demo of Avantej.",
			]
				.filter((line) => line !== null)
				.join("\n");

			const mailtoUrl = `mailto:support@avantej.com?subject=${encodeURIComponent("Demo Request")}&body=${encodeURIComponent(bodyLines)}`;
			window.location.href = mailtoUrl;
			toast.success("Opening your email client...");
		},
	});

	return (
		<div className="min-h-screen bg-zinc-50">
			{/* Hero Section */}
			<section className="py-20 bg-white border-b">
				<div className="container mx-auto px-4 text-center">
					<h1 className="text-4xl font-semibold mb-4">Request a Demo</h1>
					<p className="text-xl text-zinc-600 max-w-2xl mx-auto">
						See Avantej in action. Fill out the form below and our team will
						reach out to schedule a personalized walkthrough.
					</p>
				</div>
			</section>

			{/* Form Section */}
			<section className="py-20">
				<div className="container mx-auto px-4">
					<div className="max-w-lg mx-auto">
						<Card className="shadow-md">
							<CardHeader>
								<CardTitle>Get in Touch</CardTitle>
								<CardDescription>
									Tell us a bit about yourself and we will be in touch shortly.
								</CardDescription>
							</CardHeader>
							<CardContent>
								{/* react-doctor-disable-next-line react-doctor/no-prevent-default -- TanStack Router SPA */}
								<form
									onSubmit={(e) => {
										e.preventDefault();
										e.stopPropagation();
										form.handleSubmit();
									}}
									className="space-y-4"
								>
									<form.Field name="name">
										{(field) => (
											<div className="space-y-2">
												<Label htmlFor={field.name}>
													Name <span className="text-red-500">*</span>
												</Label>
												<Input
													id={field.name}
													placeholder="Your full name"
													value={field.state.value}
													onBlur={field.handleBlur}
													onChange={(e) => field.handleChange(e.target.value)}
												/>
												<FieldError errors={field.state.meta.errors} />
											</div>
										)}
									</form.Field>

									<form.Field name="email">
										{(field) => (
											<div className="space-y-2">
												<Label htmlFor={field.name}>
													Email <span className="text-red-500">*</span>
												</Label>
												<Input
													id={field.name}
													type="email"
													placeholder="you@company.com"
													value={field.state.value}
													onBlur={field.handleBlur}
													onChange={(e) => field.handleChange(e.target.value)}
												/>
												<FieldError errors={field.state.meta.errors} />
											</div>
										)}
									</form.Field>

									<form.Field name="company">
										{(field) => (
											<div className="space-y-2">
												<Label htmlFor={field.name}>Company</Label>
												<Input
													id={field.name}
													placeholder="Your company or franchise name"
													value={field.state.value ?? ""}
													onBlur={field.handleBlur}
													onChange={(e) => field.handleChange(e.target.value)}
												/>
												<FieldError errors={field.state.meta.errors} />
											</div>
										)}
									</form.Field>

									<form.Field name="message">
										{(field) => (
											<div className="space-y-2">
												<Label htmlFor={field.name}>How can we help?</Label>
												<Textarea
													id={field.name}
													rows={4}
													placeholder="Tell us about your business and what you are looking to achieve with Avantej..."
													value={field.state.value ?? ""}
													onBlur={field.handleBlur}
													onChange={(e) => field.handleChange(e.target.value)}
												/>
												<FieldError errors={field.state.meta.errors} />
											</div>
										)}
									</form.Field>

									<form.Subscribe selector={(state) => state.isSubmitting}>
										{(isSubmitting) => (
											<Button
												type="submit"
												size="lg"
												className="w-full bg-zinc-950 text-white hover:bg-black/90"
												disabled={isSubmitting}
											>
												Request Demo
											</Button>
										)}
									</form.Subscribe>
								</form>
							</CardContent>
						</Card>
					</div>
				</div>
			</section>
		</div>
	);
}
