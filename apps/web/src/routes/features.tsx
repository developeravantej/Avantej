import { createFileRoute } from "@tanstack/react-router";
import {
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
} from "lucide-react";

export const Route = createFileRoute("/features")({
  component: FeaturesPage,
});

function FeaturesPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="py-20 bg-zinc-50">
        <div className="container mx-auto px-4">
          <h1 className="text-4xl font-semibold text-center mb-4">
            Powerful Features for Your Business
          </h1>
          <p className="text-xl text-center text-zinc-600 max-w-3xl mx-auto">
            Discover all the tools and features that make Avantej the perfect
            solution for managing your business operations.
          </p>
        </div>
      </section>

      {/* Core Features Section */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-semibold text-center mb-4">
            Comprehensive Business Management
          </h2>
          <p className="text-center text-zinc-600 mb-12">
            Everything you need to run your business efficiently
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Dashboard & Analytics */}
            <div className="p-6 bg-zinc-50 rounded-xl hover:shadow-lg transition-shadow">
              <div className="size-12 bg-black/5 rounded-lg flex items-center justify-center mb-4">
                <HomeIcon className="size-6 text-black" />
              </div>
              <h3 className="text-xl font-semibold mb-3">
                Dashboard & Analytics
              </h3>
              <p className="text-zinc-600 mb-4">
                Centralized dashboard with real-time insights and performance
                metrics.
              </p>
            </div>

            {/* Scoreboards */}
            <div className="p-6 bg-zinc-50 rounded-xl hover:shadow-lg transition-shadow">
              <div className="size-12 bg-black/5 rounded-lg flex items-center justify-center mb-4">
                <ClipboardList className="size-6 text-black" />
              </div>
              <h3 className="text-xl font-semibold mb-3">
                Performance Scoreboards
              </h3>
              <p className="text-zinc-600 mb-4">
                Track and compare performance metrics across branches and teams.
              </p>
            </div>

            {/* Client Management */}
            <div className="p-6 bg-zinc-50 rounded-xl hover:shadow-lg transition-shadow">
              <div className="size-12 bg-black/5 rounded-lg flex items-center justify-center mb-4">
                <UserCircle className="size-6 text-black" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Client Management</h3>
              <p className="text-zinc-600 mb-4">
                Comprehensive client database with profiles, history, and
                interactions.
              </p>
            </div>

            {/* Calendar */}
            <div className="p-6 bg-zinc-50 rounded-xl hover:shadow-lg transition-shadow">
              <div className="size-12 bg-black/5 rounded-lg flex items-center justify-center mb-4">
                <Calendar className="size-6 text-black" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Smart Calendar</h3>
              <p className="text-zinc-600 mb-4">
                Schedule management with automated reminders and team
                coordination.
              </p>
            </div>

            {/* Payroll Management */}
            <div className="p-6 bg-zinc-50 rounded-xl hover:shadow-lg transition-shadow">
              <div className="size-12 bg-black/5 rounded-lg flex items-center justify-center mb-4">
                <DollarSign className="size-6 text-black" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Payroll Management</h3>
              <p className="text-zinc-600 mb-4">
                Automated payroll processing with tax calculations and direct
                deposits.
              </p>
            </div>

            {/* Admin Controls */}
            <div className="p-6 bg-zinc-50 rounded-xl hover:shadow-lg transition-shadow">
              <div className="size-12 bg-black/5 rounded-lg flex items-center justify-center mb-4">
                <Settings className="size-6 text-black" />
              </div>
              <h3 className="text-xl font-semibold mb-3">
                Advanced Admin Settings
              </h3>
              <p className="text-zinc-600 mb-4">
                Customizable controls for system configuration and management.
              </p>
            </div>
          </div>

          {/* Additional Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mt-12">
            {/* Claims & Expenses */}
            <div className="p-6 bg-zinc-50 rounded-xl hover:shadow-lg transition-shadow">
              <div className="size-12 bg-black/5 rounded-lg flex items-center justify-center mb-4">
                <FileText className="size-6 text-black" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Claims & Expenses</h3>
              <p className="text-zinc-600 mb-4">
                Streamlined expense tracking and reimbursement processing.
              </p>
            </div>

            {/* User Roles */}
            <div className="p-6 bg-zinc-50 rounded-xl hover:shadow-lg transition-shadow">
              <div className="size-12 bg-black/5 rounded-lg flex items-center justify-center mb-4">
                <UserCog className="size-6 text-black" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Role Management</h3>
              <p className="text-zinc-600 mb-4">
                Granular access control and permission management for team
                members.
              </p>
            </div>

            {/* Profit/Loss Tracking */}
            <div className="p-6 bg-zinc-50 rounded-xl hover:shadow-lg transition-shadow">
              <div className="size-12 bg-black/5 rounded-lg flex items-center justify-center mb-4">
                <PieChart className="size-6 text-black" />
              </div>
              <h3 className="text-xl font-semibold mb-3">
                Financial Analytics
              </h3>
              <p className="text-zinc-600 mb-4">
                Detailed profit/loss tracking with customizable reporting.
              </p>
            </div>

            {/* Packages */}
            <div className="p-6 bg-zinc-50 rounded-xl hover:shadow-lg transition-shadow">
              <div className="size-12 bg-black/5 rounded-lg flex items-center justify-center mb-4">
                <Package className="size-6 text-black" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Package Management</h3>
              <p className="text-zinc-600 mb-4">
                Create and manage service packages with flexible pricing
                options.
              </p>
            </div>

            {/* Payments & Invoicing */}
            <div className="p-6 bg-zinc-50 rounded-xl hover:shadow-lg transition-shadow">
              <div className="size-12 bg-black/5 rounded-lg flex items-center justify-center mb-4">
                <Receipt className="size-6 text-black" />
              </div>
              <h3 className="text-xl font-semibold mb-3">
                Payments & Invoicing
              </h3>
              <p className="text-zinc-600 mb-4">
                Automated billing, invoicing, and payment processing solutions.
              </p>
            </div>

            {/* Purchase Approval */}
            <div className="p-6 bg-zinc-50 rounded-xl hover:shadow-lg transition-shadow">
              <div className="size-12 bg-black/5 rounded-lg flex items-center justify-center mb-4">
                <CheckSquare className="size-6 text-black" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Purchase Approval</h3>
              <p className="text-zinc-600 mb-4">
                Streamlined purchase request and approval workflow system.
              </p>
            </div>
          </div>

          {/* System Features */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12">
            {/* Data Center */}
            <div className="p-6 bg-zinc-50 rounded-xl hover:shadow-lg transition-shadow">
              <div className="size-12 bg-black/5 rounded-lg flex items-center justify-center mb-4">
                <Database className="size-6 text-black" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Data Center</h3>
              <p className="text-zinc-600 mb-4">
                Centralized data management with robust backup and security
                features.
              </p>
            </div>

            {/* Announcements */}
            <div className="p-6 bg-zinc-50 rounded-xl hover:shadow-lg transition-shadow">
              <div className="size-12 bg-black/5 rounded-lg flex items-center justify-center mb-4">
                <Bell className="size-6 text-black" />
              </div>
              <h3 className="text-xl font-semibold mb-3">
                Announcement System
              </h3>
              <p className="text-zinc-600 mb-4">
                Internal communication tools for company-wide announcements.
              </p>
            </div>

            {/* Branding */}
            <div className="p-6 bg-zinc-50 rounded-xl hover:shadow-lg transition-shadow">
              <div className="size-12 bg-black/5 rounded-lg flex items-center justify-center mb-4">
                <Palette className="size-6 text-black" />
              </div>
              <h3 className="text-xl font-semibold mb-3">
                Branding Customization
              </h3>
              <p className="text-zinc-600 mb-4">
                Customize the platform's appearance to match your brand
                identity.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
