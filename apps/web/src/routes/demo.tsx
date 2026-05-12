import { createFileRoute } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
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

function DemoPage() {
	const form = useForm<DemoForm>({
		resolver: zodResolver(demoSchema),
		defaultValues: {
			name: "",
			email: "",
			company: "",
			message: "",
		},
	});

	const onSubmit = (data: DemoForm) => {
		const bodyLines = [
			`From: ${data.name} (${data.email})`,
			data.company ? `Company: ${data.company}` : null,
			"",
			data.message || "I would like to request a demo of Avantej.",
		]
			.filter((line) => line !== null)
			.join("\n");

		const mailtoUrl = `mailto:support@avantej.com?subject=${encodeURIComponent("Demo Request")}&body=${encodeURIComponent(bodyLines)}`;
		window.location.href = mailtoUrl;
		toast.success("Opening your email client...");
	};

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
								<Form {...form}>
									<form
										onSubmit={form.handleSubmit(onSubmit)}
										className="space-y-4"
									>
										<FormField
											control={form.control}
											name="name"
											render={({ field }) => (
												<FormItem>
													<FormLabel>
														Name <span className="text-red-500">*</span>
													</FormLabel>
													<FormControl>
														<Input placeholder="Your full name" {...field} />
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>
										<FormField
											control={form.control}
											name="email"
											render={({ field }) => (
												<FormItem>
													<FormLabel>
														Email <span className="text-red-500">*</span>
													</FormLabel>
													<FormControl>
														<Input
															type="email"
															placeholder="you@company.com"
															{...field}
														/>
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>
										<FormField
											control={form.control}
											name="company"
											render={({ field }) => (
												<FormItem>
													<FormLabel>Company</FormLabel>
													<FormControl>
														<Input
															placeholder="Your company or franchise name"
															{...field}
														/>
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>
										<FormField
											control={form.control}
											name="message"
											render={({ field }) => (
												<FormItem>
													<FormLabel>How can we help?</FormLabel>
													<FormControl>
														<Textarea
															rows={4}
															placeholder="Tell us about your business and what you are looking to achieve with Avantej..."
															{...field}
														/>
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>
										<Button
											type="submit"
											size="lg"
											className="w-full bg-zinc-950 text-white hover:bg-black/90"
											disabled={form.formState.isSubmitting}
										>
											Request Demo
										</Button>
									</form>
								</Form>
							</CardContent>
						</Card>
					</div>
				</div>
			</section>
		</div>
	);
}
