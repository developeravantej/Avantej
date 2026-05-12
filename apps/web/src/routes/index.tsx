import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import {
	BarChart3,
	Users,
	Building2,
	CreditCard,
	TrendingUp,
	Award,
	Check,
	ArrowRight,
	HomeIcon,
	ClipboardList,
	UserCircle,
	Calendar,
	DollarSign,
	Settings,
	FileText,
	UserCog,
	PieChart,
	Package,
	Receipt,
	CheckSquare,
	Database,
	Bell,
	Palette,
	type LucideIcon,
} from "lucide-react";
import {
	Card,
	CardHeader,
	CardTitle,
	CardDescription,
	CardContent,
	CardFooter,
} from "@/components/ui/card";

type LandingSearch = {
	invitationToken?: string;
	orgId?: string;
};

export const Route = createFileRoute("/")({
	component: HomeComponent,
	validateSearch: (search: Record<string, unknown>): LandingSearch => {
		return {
			invitationToken:
				typeof search.invitationToken === "string"
					? search.invitationToken
					: undefined,
			orgId: typeof search.orgId === "string" ? search.orgId : undefined,
		};
	},
});

function FeatureCard({
	icon: Icon,
	title,
	description,
}: {
	icon: LucideIcon;
	title: string;
	description: string;
}) {
	return (
		<div className="p-6 bg-white rounded-lg shadow-md border border-gray-100 hover:shadow-lg transition-shadow">
			<div className="size-12 bg-black/5 rounded-lg flex items-center justify-center mb-4">
				<Icon className="size-6 text-black" />
			</div>
			<h3 className="text-xl font-semibold mb-2">{title}</h3>
			<p className="text-gray-600">{description}</p>
		</div>
	);
}

function StatCard({ number, label }: { number: string; label: string }) {
	return (
		<div className="text-center">
			<div className="text-4xl font-bold mb-2">{number}</div>
			<div className="text-gray-600">{label}</div>
		</div>
	);
}

function TestimonialCard({
	quote,
	author,
	role,
	company,
}: {
	quote: string;
	author: string;
	role: string;
	company: string;
}) {
	return (
		<div className="bg-white p-6 rounded-lg shadow-md">
			<p className="text-gray-600 italic mb-4">"{quote}"</p>
			<div className="font-semibold">{author}</div>
			<div className="text-sm text-gray-500">
				{role} at {company}
			</div>
		</div>
	);
}

// react-doctor-disable-next-line react-doctor/no-giant-component -- page-level component with deep closure dependencies (form state, mutations, modal flags); extraction deferred to dedicated refactor — splitting now would require lifting state and risks tsc regressions
function HomeComponent() {
	const { invitationToken, orgId } = useSearch({ from: "/" });
	const loginSearch: LandingSearch =
		invitationToken && orgId ? { invitationToken, orgId } : {};

	return (
		<div className="min-h-screen">
			{/* Header */}
			<header className="w-full p-4 bg-white border-b border-gray-200 fixed top-0 z-50">
				<div className="container mx-auto flex justify-between items-center">
					<div className="flex items-center gap-2">
						<img src="/logo_only.png" alt="Logo" className="h-8 w-auto" />
						<div className="flex flex-col leading-none">
							<span className="font-heading font-bold text-2xl leading-none">
								avantej
							</span>
							<span className="font-heading font-bold text-2xl leading-none -mt-1">
								core
							</span>
						</div>
					</div>
					<div className="flex gap-4 items-center">
						<Link
							to="/login"
							search={loginSearch}
							className={cn(
								buttonVariants({
									variant: "ghost",
									size: "sm",
								})
							)}
						>
							Login
						</Link>
						<Link
							to="/login"
							search={loginSearch}
							className={cn(
								buttonVariants({
									size: "sm",
								})
							)}
						>
							Get Started
						</Link>
					</div>
				</div>
			</header>

		{/* Hero Section */}
		<section className="pt-32 pb-20 bg-brand-secondary-2">
				<div className="container mx-auto px-4">
					<div className="max-w-3xl mx-auto text-center">
						<h1 className="text-5xl font-bold mb-6">
							Streamline Your Business Operations with Powerful KPI Tracking
						</h1>
						<p className="text-xl text-gray-600 mb-8">
							Get complete visibility into your branches, staff performance, and
							financial metrics all in one place.
						</p>
					<div className="flex gap-4 justify-center">
						<Link
							to="/login"
							search={loginSearch}
							className={cn(
								buttonVariants({
									size: "lg",
								}),
								"bg-gray-950 text-white hover:bg-black/90"
							)}
						>
							Get Started
						</Link>
						<Link
							to="/login"
							search={loginSearch}
							className={cn(
								buttonVariants({
									size: "lg",
									variant: "outline",
								})
							)}
						>
							Request Demo
						</Link>
					</div>
					</div>
				</div>
			</section>

			{/* Top Features Section */}
			<section className="py-20 bg-white">
				<div className="container mx-auto px-4">
					<div className="text-center mb-12">
						<h1 className="text-3xl font-bold mb-4 ">Key Features</h1>
						<h3 className="text-gray-600 max-w-2xl mx-auto">
							Discover how Avantej helps you manage your business more
							efficiently
						</h3>
					</div>

					<div className="grid md:grid-cols-3 gap-8 mb-12">
						{/* Client Management */}
						<div className="p-8 bg-gray-50 rounded-xl hover:shadow-lg transition-all group">
							<div className="size-12 bg-black/5 rounded-lg flex items-center justify-center mb-6 group-hover:bg-gray-950 group-hover:text-white transition-colors">
								<UserCircle className="size-6" />
							</div>
							<h3 className="text-xl font-semibold mb-4">Client Management</h3>
							<ul className="space-y-3 mb-6">
								<li className="flex items-center gap-2">
									<Check className="size-5 text-green-500 flex-shrink-0" />
									<span>Comprehensive client profiles</span>
								</li>
								<li className="flex items-center gap-2">
									<Check className="size-5 text-green-500 flex-shrink-0" />
									<span>Interaction history tracking</span>
								</li>
								<li className="flex items-center gap-2">
									<Check className="size-5 text-green-500 flex-shrink-0" />
									<span>Automated notifications</span>
								</li>
							</ul>
						</div>

						{/* Financial Management */}
						<div className="p-8 bg-gray-50 rounded-xl hover:shadow-lg transition-all group">
							<div className="size-12 bg-black/5 rounded-lg flex items-center justify-center mb-6 group-hover:bg-gray-950 group-hover:text-white transition-colors">
								<DollarSign className="size-6" />
							</div>
							<h3 className="text-xl font-semibold mb-4">
								Financial Management
							</h3>
							<ul className="space-y-3 mb-6">
								<li className="flex items-center gap-2">
									<Check className="size-5 text-green-500 flex-shrink-0" />
									<span>Automated payroll processing</span>
								</li>
								<li className="flex items-center gap-2">
									<Check className="size-5 text-green-500 flex-shrink-0" />
									<span>Expense tracking</span>
								</li>
								<li className="flex items-center gap-2">
									<Check className="size-5 text-green-500 flex-shrink-0" />
									<span>Financial reporting</span>
								</li>
							</ul>
						</div>

						{/* Analytics & Reporting */}
						<div className="p-8 bg-gray-50 rounded-xl hover:shadow-lg transition-all group">
							<div className="size-12 bg-black/5 rounded-lg flex items-center justify-center mb-6 group-hover:bg-gray-950 group-hover:text-white transition-colors">
								<PieChart className="size-6" />
							</div>
							<h3 className="text-xl font-semibold mb-4">
								Analytics & Reporting
							</h3>
							<ul className="space-y-3 mb-6">
								<li className="flex items-center gap-2">
									<Check className="size-5 text-green-500 flex-shrink-0" />
									<span>Real-time KPI tracking</span>
								</li>
								<li className="flex items-center gap-2">
									<Check className="size-5 text-green-500 flex-shrink-0" />
									<span>Custom report generation</span>
								</li>
								<li className="flex items-center gap-2">
									<Check className="size-5 text-green-500 flex-shrink-0" />
									<span>Performance insights</span>
								</li>
							</ul>
						</div>
					</div>

						<div className="text-center">
							<Link
								to="/login"
								search={loginSearch}
								className={cn(
								buttonVariants({
									size: "lg",
								}),
								"group"
							)}
						>
							Explore All Features
							<ArrowRight className="ml-2 size-4 transition-transform group-hover:translate-x-1" />
						</Link>
					</div>
				</div>
			</section>

		{/* Stats Section */}
		<section className="py-20 bg-brand-secondary-3">
				<div className="container mx-auto px-4">
					<div className="grid grid-cols-2 md:grid-cols-4 gap-8">
						<StatCard number="500+" label="Active Branches" />
						<StatCard number="10k+" label="Staff Managed" />
						<StatCard number="98%" label="Client Satisfaction" />
						<StatCard number="25M+" label="Transactions Processed" />
					</div>
				</div>
			</section>

			{/* Core Features Section */}
			<section className="py-20 bg-white">
				<div className="container mx-auto px-4">
					<h1 className="text-3xl font-bold text-center mb-4">
						Comprehensive Business Management
					</h1>
					<h3 className="text-center text-gray-600 mb-12">
						Everything you need to run your business efficiently
					</h3>

					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
						{/* Dashboard & Analytics */}
						<div className="p-6 bg-gray-50 rounded-xl">
							<div className="size-12 bg-black/5 rounded-lg flex items-center justify-center mb-4">
								<HomeIcon className="size-6 text-black" />
							</div>
							<h3 className="text-xl font-semibold mb-3">
								Dashboard & Analytics
							</h3>
							<p className="text-gray-600 mb-4">
								Centralized dashboard with real-time insights and performance
								metrics.
							</p>
						</div>

						{/* Scoreboards */}
						<div className="p-6 bg-gray-50 rounded-xl">
							<div className="size-12 bg-black/5 rounded-lg flex items-center justify-center mb-4">
								<ClipboardList className="size-6 text-black" />
							</div>
							<h3 className="text-xl font-semibold mb-3">
								Performance Scoreboards
							</h3>
							<p className="text-gray-600 mb-4">
								Track and compare performance metrics across branches and teams.
							</p>
						</div>

						{/* Client Management */}
						<div className="p-6 bg-gray-50 rounded-xl">
							<div className="size-12 bg-black/5 rounded-lg flex items-center justify-center mb-4">
								<UserCircle className="size-6 text-black" />
							</div>
							<h3 className="text-xl font-semibold mb-3">Client Management</h3>
							<p className="text-gray-600 mb-4">
								Comprehensive client database with profiles, history, and
								interactions.
							</p>
						</div>

						{/* Calendar */}
						<div className="p-6 bg-gray-50 rounded-xl">
							<div className="size-12 bg-black/5 rounded-lg flex items-center justify-center mb-4">
								<Calendar className="size-6 text-black" />
							</div>
							<h3 className="text-xl font-semibold mb-3">Smart Calendar</h3>
							<p className="text-gray-600 mb-4">
								Schedule management with automated reminders and team
								coordination.
							</p>
						</div>

						{/* Payroll Management */}
						<div className="p-6 bg-gray-50 rounded-xl">
							<div className="size-12 bg-black/5 rounded-lg flex items-center justify-center mb-4">
								<DollarSign className="size-6 text-black" />
							</div>
							<h3 className="text-xl font-semibold mb-3">Payroll Management</h3>
							<p className="text-gray-600 mb-4">
								Automated payroll processing with tax calculations and direct
								deposits.
							</p>
						</div>

						{/* Admin Controls */}
						<div className="p-6 bg-gray-50 rounded-xl">
							<div className="size-12 bg-black/5 rounded-lg flex items-center justify-center mb-4">
								<Settings className="size-6 text-black" />
							</div>
							<h3 className="text-xl font-semibold mb-3">
								Advanced Admin Settings
							</h3>
							<p className="text-gray-600 mb-4">
								Customizable controls for system configuration and management.
							</p>
						</div>
					</div>

					{/* Additional Features Grid */}
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mt-12">
						{/* Claims & Expenses */}
						<div className="p-6 bg-gray-50 rounded-xl">
							<div className="size-12 bg-black/5 rounded-lg flex items-center justify-center mb-4">
								<FileText className="size-6 text-black" />
							</div>
							<h3 className="text-xl font-semibold mb-3">Claims & Expenses</h3>
							<p className="text-gray-600 mb-4">
								Streamlined expense tracking and reimbursement processing.
							</p>
						</div>

						{/* User Roles */}
						<div className="p-6 bg-gray-50 rounded-xl">
							<div className="size-12 bg-black/5 rounded-lg flex items-center justify-center mb-4">
								<UserCog className="size-6 text-black" />
							</div>
							<h3 className="text-xl font-semibold mb-3">Role Management</h3>
							<p className="text-gray-600 mb-4">
								Granular access control and permission management for team
								members.
							</p>
						</div>

						{/* Profit/Loss Tracking */}
						<div className="p-6 bg-gray-50 rounded-xl">
							<div className="size-12 bg-black/5 rounded-lg flex items-center justify-center mb-4">
								<PieChart className="size-6 text-black" />
							</div>
							<h3 className="text-xl font-semibold mb-3">
								Financial Analytics
							</h3>
							<p className="text-gray-600 mb-4">
								Detailed profit/loss tracking with customizable reporting.
							</p>
						</div>

						{/* Packages */}
						<div className="p-6 bg-gray-50 rounded-xl">
							<div className="size-12 bg-black/5 rounded-lg flex items-center justify-center mb-4">
								<Package className="size-6 text-black" />
							</div>
							<h3 className="text-xl font-semibold mb-3">Package Management</h3>
							<p className="text-gray-600 mb-4">
								Create and manage service packages with flexible pricing
								options.
							</p>
						</div>

						{/* Payments & Invoicing */}
						<div className="p-6 bg-gray-50 rounded-xl">
							<div className="size-12 bg-black/5 rounded-lg flex items-center justify-center mb-4">
								<Receipt className="size-6 text-black" />
							</div>
							<h3 className="text-xl font-semibold mb-3">
								Payments & Invoicing
							</h3>
							<p className="text-gray-600 mb-4">
								Automated billing, invoicing, and payment processing solutions.
							</p>
						</div>

						{/* Purchase Approval */}
						<div className="p-6 bg-gray-50 rounded-xl">
							<div className="size-12 bg-black/5 rounded-lg flex items-center justify-center mb-4">
								<CheckSquare className="size-6 text-black" />
							</div>
							<h3 className="text-xl font-semibold mb-3">Purchase Approval</h3>
							<p className="text-gray-600 mb-4">
								Streamlined purchase request and approval workflow system.
							</p>
						</div>
					</div>

					{/* System Features */}
					<div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12">
						{/* Data Center */}
						<div className="p-6 bg-gray-50 rounded-xl">
							<div className="size-12 bg-black/5 rounded-lg flex items-center justify-center mb-4">
								<Database className="size-6 text-black" />
							</div>
							<h3 className="text-xl font-semibold mb-3">Data Center</h3>
							<p className="text-gray-600 mb-4">
								Centralized data management with robust backup and security
								features.
							</p>
						</div>

						{/* Announcements */}
						<div className="p-6 bg-gray-50 rounded-xl">
							<div className="size-12 bg-black/5 rounded-lg flex items-center justify-center mb-4">
								<Bell className="size-6 text-black" />
							</div>
							<h3 className="text-xl font-semibold mb-3">
								Announcement System
							</h3>
							<p className="text-gray-600 mb-4">
								Internal communication tools for company-wide announcements.
							</p>
						</div>

						{/* Branding */}
						<div className="p-6 bg-gray-50 rounded-xl">
							<div className="size-12 bg-black/5 rounded-lg flex items-center justify-center mb-4">
								<Palette className="size-6 text-black" />
							</div>
							<h3 className="text-xl font-semibold mb-3">
								Branding Customization
							</h3>
							<p className="text-gray-600 mb-4">
								Customize the platform's appearance to match your brand
								identity.
							</p>
						</div>
					</div>
				</div>
			</section>

			{/* Features Grid */}
			<section className="py-20 bg-white">
				<div className="container mx-auto px-4">
					<h1 className="text-3xl font-bold text-center mb-12">
						Everything you need to scale your business
					</h1>
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
						<FeatureCard
							icon={Building2}
							title="Branch Management"
							description="Track performance metrics across all your locations in real-time with detailed analytics and reporting."
						/>
						<FeatureCard
							icon={Users}
							title="Staff Performance"
							description="Monitor employee productivity, attendance, and KPIs to optimize workforce management."
						/>
						<FeatureCard
							icon={BarChart3}
							title="KPI Dashboard"
							description="Visualize critical business metrics and make data-driven decisions with customizable dashboards."
						/>
						<FeatureCard
							icon={CreditCard}
							title="Financial Tracking"
							description="Keep track of revenue, expenses, and payroll across all branches with automated reporting."
						/>
						<FeatureCard
							icon={TrendingUp}
							title="Growth Analytics"
							description="Identify trends and opportunities with advanced analytics and forecasting tools."
						/>
						<FeatureCard
							icon={Award}
							title="Client Management"
							description="Manage client relationships, track satisfaction scores, and improve retention rates."
						/>
					</div>
				</div>
			</section>

			{/* How It Works Section */}
			<section className="py-20 bg-gray-50">
				<div className="container mx-auto px-4">
					<h1 className="text-3xl font-bold text-center mb-12">How It Works</h1>
					<div className="grid md:grid-cols-3 gap-8">
						<div className="text-center">
							<div className="size-16 bg-gray-950 text-white rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">
								1
							</div>
							<h3 className="text-xl font-semibold mb-2">
								Set Up Your Account
							</h3>
							<p className="text-gray-600">
								Quick onboarding process with guided setup for your business
								structure
							</p>
						</div>
						<div className="text-center">
							<div className="size-16 bg-gray-950 text-white rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">
								2
							</div>
							<h3 className="text-xl font-semibold mb-2">Import Your Data</h3>
							<p className="text-gray-600">
								Easily import your existing data or start fresh with our
								templates
							</p>
						</div>
						<div className="text-center">
							<div className="size-16 bg-gray-950 text-white rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-bold">
								3
							</div>
							<h3 className="text-xl font-semibold mb-2">Track & Optimize</h3>
							<p className="text-gray-600">
								Monitor KPIs in real-time and make data-driven decisions
							</p>
						</div>
					</div>
				</div>
			</section>

			{/* Testimonials Section */}
			<section className="py-20 bg-white">
				<div className="container mx-auto px-4">
					<h1 className="text-3xl font-bold text-center mb-12">
						What Our Clients Say
					</h1>
					<div className="grid md:grid-cols-3 gap-8">
						<TestimonialCard
							quote="Avantej has transformed how we manage our multiple locations. The insights we get are invaluable."
							author="Sarah Johnson"
							role="Operations Director"
							company="FitLife Gyms"
						/>
						<TestimonialCard
							quote="The staff management features have helped us optimize our workforce and improve productivity by 40%."
							author="Michael Chen"
							role="CEO"
							company="Retail Chain Co."
						/>
						<TestimonialCard
							quote="The financial tracking and reporting capabilities have made our month-end closing process 75% faster."
							author="Amanda Rodriguez"
							role="Financial Controller"
							company="ServicePro Inc."
						/>
					</div>
				</div>
			</section>

			{/* Pricing Section */}
			<section className="py-20 bg-gray-50">
				<div className="container mx-auto px-4">
					<h1 className="text-3xl font-bold text-center mb-4">
						Simple, Transparent Pricing
					</h1>
					<h3 className="text-center text-gray-600 mb-12">
						Choose the plan that best fits your business needs
					</h3>

					<div className="container mx-auto max-w-4xl">
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
							<Card className="flex flex-col transition-shadow hover:shadow-lg">
								<CardHeader>
									<CardTitle className="text-xl">Starter</CardTitle>
									<CardDescription className="text-sm">
										Perfect for small businesses
									</CardDescription>
								</CardHeader>
								<CardContent className="flex-grow space-y-4">
									<div>
										<p className="text-3xl font-bold">
											$99
											<span className="text-sm font-normal text-muted-foreground uppercase ml-1">
												USD
											</span>
										</p>
										<p className="text-sm text-muted-foreground">per month</p>
									</div>
									<ul className="space-y-2 text-sm text-muted-foreground pt-2">
										<li className="flex items-center">
											<Check className="size-4 mr-2 text-green-500 flex-shrink-0" />
											<span>Up to 3 branches</span>
										</li>
										<li className="flex items-center">
											<Check className="size-4 mr-2 text-green-500 flex-shrink-0" />
											<span>10 staff members</span>
										</li>
										<li className="flex items-center">
											<Check className="size-4 mr-2 text-green-500 flex-shrink-0" />
											<span>Basic KPI dashboard</span>
										</li>
										<li className="flex items-center">
											<Check className="size-4 mr-2 text-green-500 flex-shrink-0" />
											<span>Email support</span>
										</li>
										<li className="flex items-center">
											<Check className="size-4 mr-2 text-green-500 flex-shrink-0" />
											<span>Weekly reports</span>
										</li>
									</ul>
								</CardContent>
									<CardFooter>
										<Link
											to="/login"
											search={loginSearch}
											className={cn(
											buttonVariants({
												size: "lg",
											}),
											"w-full"
										)}
									>
										Get Started
									</Link>
								</CardFooter>
							</Card>

							<Card className="flex flex-col transition-shadow hover:shadow-lg">
								<CardHeader>
									<CardTitle className="text-xl">Professional</CardTitle>
									<CardDescription className="text-sm">
										For growing businesses
									</CardDescription>
								</CardHeader>
								<CardContent className="flex-grow space-y-4">
									<div>
										<p className="text-3xl font-bold">
											$299
											<span className="text-sm font-normal text-muted-foreground uppercase ml-1">
												USD
											</span>
										</p>
										<p className="text-sm text-muted-foreground">per month</p>
									</div>
									<ul className="space-y-2 text-sm text-muted-foreground pt-2">
										<li className="flex items-center">
											<Check className="size-4 mr-2 text-green-500 flex-shrink-0" />
											<span>Up to 10 branches</span>
										</li>
										<li className="flex items-center">
											<Check className="size-4 mr-2 text-green-500 flex-shrink-0" />
											<span>50 staff members</span>
										</li>
										<li className="flex items-center">
											<Check className="size-4 mr-2 text-green-500 flex-shrink-0" />
											<span>Advanced KPI dashboard</span>
										</li>
										<li className="flex items-center">
											<Check className="size-4 mr-2 text-green-500 flex-shrink-0" />
											<span>Priority support</span>
										</li>
										<li className="flex items-center">
											<Check className="size-4 mr-2 text-green-500 flex-shrink-0" />
											<span>Daily reports</span>
										</li>
										<li className="flex items-center">
											<Check className="size-4 mr-2 text-green-500 flex-shrink-0" />
											<span>Custom analytics</span>
										</li>
									</ul>
								</CardContent>
									<CardFooter>
										<Link
											to="/login"
											search={loginSearch}
											className={cn(
											buttonVariants({
												size: "lg",
											}),
											"w-full bg-gray-950 text-white hover:bg-black/90"
										)}
									>
										Get Started
									</Link>
								</CardFooter>
							</Card>

							<Card className="flex flex-col transition-shadow hover:shadow-lg">
								<CardHeader>
									<CardTitle className="text-xl">Enterprise</CardTitle>
									<CardDescription className="text-sm">
										For large organizations
									</CardDescription>
								</CardHeader>
								<CardContent className="flex-grow space-y-4">
									<div>
										<p className="text-3xl font-bold">
											$599
											<span className="text-sm font-normal text-muted-foreground uppercase ml-1">
												USD
						</span>
										</p>
										<p className="text-sm text-muted-foreground">per month</p>
									</div>
									<ul className="space-y-2 text-sm text-muted-foreground pt-2">
										<li className="flex items-center">
											<Check className="size-4 mr-2 text-green-500 flex-shrink-0" />
											<span>Unlimited branches</span>
										</li>
										<li className="flex items-center">
											<Check className="size-4 mr-2 text-green-500 flex-shrink-0" />
											<span>Unlimited staff</span>
										</li>
										<li className="flex items-center">
											<Check className="size-4 mr-2 text-green-500 flex-shrink-0" />
											<span>Custom KPI dashboard</span>
										</li>
										<li className="flex items-center">
											<Check className="size-4 mr-2 text-green-500 flex-shrink-0" />
											<span>24/7 dedicated support</span>
										</li>
										<li className="flex items-center">
											<Check className="size-4 mr-2 text-green-500 flex-shrink-0" />
											<span>Real-time reporting</span>
										</li>
										<li className="flex items-center">
											<Check className="size-4 mr-2 text-green-500 flex-shrink-0" />
											<span>API access</span>
										</li>
										<li className="flex items-center">
											<Check className="size-4 mr-2 text-green-500 flex-shrink-0" />
											<span>White-label options</span>
										</li>
									</ul>
								</CardContent>
									<CardFooter>
										<Link
											to="/login"
											search={loginSearch}
											className={cn(
											buttonVariants({
												size: "lg",
											}),
											"w-full"
										)}
									>
										Get Started
									</Link>
								</CardFooter>
							</Card>
						</div>
					</div>
				</div>
			</section>

		{/* CTA Section */}
		<section className="py-20 bg-brand-secondary-3 text-white">
				<div className="container mx-auto px-4 text-center">
					<h1 className="text-3xl font-bold mb-6">
						Ready to transform your business?
					</h1>
					<h3 className="text-xl mb-8 text-gray-300">
						Join thousands of businesses using Avantej to scale their
						operations.
					</h3>
						<Link
							to="/login"
							search={loginSearch}
							className={cn(
							buttonVariants({
								size: "lg",
							}),
							"bg-white text-black hover:bg-gray-100"
						)}
					>
						Get Started Now
					</Link>
					</div>
				</section>

			{/* Add a small features teaser section */}
			<section className="py-20 bg-gray-50">
				<div className="container mx-auto px-4 text-center">
					<h1 className="text-3xl font-bold mb-6">
						Powerful Features for Your Business
					</h1>
					<h3 className="text-xl mb-8 text-gray-600 max-w-3xl mx-auto">
						Discover all the tools and features that make Avantej the perfect
						solution for managing your business operations.
					</h3>
						<Link
							to="/login"
							search={loginSearch}
							className={cn(
							buttonVariants({
								size: "lg",
							}),
							"bg-gray-950 text-white hover:bg-black/90"
						)}
					>
						Explore All Features
					</Link>
			</div>
			</section>
		</div>
	);
}
