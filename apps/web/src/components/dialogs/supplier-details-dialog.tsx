import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Phone, Mail, Globe, User, Building, Calendar, Hash } from "lucide-react";

interface SupplierDetails {
	id: string;
	name: string;
	description?: string | null;
	accountNumber?: string | null;
	paymentTerms?: string | null;
	contactPerson?: string | null;
	contactPhone?: string | null;
	officePhone?: string | null;
	email?: string | null;
	website?: string | null;
	barcode?: string | null;
	isActive?: boolean | null;
	createdAt?: string | null;
	updatedAt?: string | null;
}

interface SupplierDetailsDialogProps {
	isOpen: boolean;
	onClose: () => void;
	supplier: SupplierDetails | null;
	onEdit?: () => void;
}

export function SupplierDetailsDialog({
	isOpen,
	onClose,
	supplier,
	onEdit,
}: SupplierDetailsDialogProps) {
	if (!supplier) return null;

	const formatDate = (dateString?: string | null) => {
		if (!dateString) return "N/A";
		return new Date(dateString).toLocaleDateString("en-US", {
			year: "numeric",
			month: "long",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	};

	return (
		<Dialog open={isOpen} onOpenChange={onClose}>
			<DialogContent className="max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<div className="flex items-center justify-between">
						<DialogTitle className="text-2xl font-bold flex items-center gap-2">
							{supplier.name}
							{onEdit && (
								<Button variant="outline" size="sm" onClick={onEdit}>
									Edit Supplier
								</Button>
							)}
						</DialogTitle>
						{supplier.isActive !== undefined && (
							<Badge variant={supplier.isActive ? "default" : "secondary"}>
								{supplier.isActive ? "Active" : "Inactive"}
							</Badge>
						)}
					</div>
				</DialogHeader>

				<div className="space-y-6">
					{/* Basic Information */}
					<div className="space-y-4">
						<h3 className="text-lg font-semibold flex items-center gap-2">
							<Building className="size-5" />
							Basic Information
						</h3>
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div className="space-y-2">
								<span className="block text-sm font-medium text-brand-secondary-1">Description</span>
								<p className="text-sm">{supplier.description || "N/A"}</p>
							</div>
							<div className="space-y-2">
								<span className="block text-sm font-medium text-brand-secondary-1">Account Number</span>
								<p className="text-sm font-mono">{supplier.accountNumber || "N/A"}</p>
							</div>
							<div className="space-y-2">
								<span className="block text-sm font-medium text-brand-secondary-1">Payment Terms</span>
								<p className="text-sm">{supplier.paymentTerms || "N/A"}</p>
							</div>
							<div className="space-y-2">
								<span className="block text-sm font-medium text-brand-secondary-1">Barcode</span>
								<p className="text-sm font-mono">{supplier.barcode || "N/A"}</p>
							</div>
						</div>
					</div>

					<Separator />

					{/* Contact Information */}
					<div className="space-y-4">
						<h3 className="text-lg font-semibold flex items-center gap-2">
							<User className="size-5" />
							Contact Information
						</h3>
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div className="space-y-2">
								<span className="block text-sm font-medium text-brand-secondary-1">Contact Person</span>
								<p className="text-sm">{supplier.contactPerson || "N/A"}</p>
							</div>
							<div className="space-y-2">
								<span className="block text-sm font-medium text-brand-secondary-1 flex items-center gap-1">
									<Phone className="size-4" />
									Mobile
								</span>
								{supplier.contactPhone ? (
									<a
										href={`tel:${supplier.contactPhone}`}
										className="text-sm text-blue-600 hover:underline"
									>
										{supplier.contactPhone}
									</a>
								) : (
									<p className="text-sm">N/A</p>
								)}
							</div>
							<div className="space-y-2">
								<span className="block text-sm font-medium text-brand-secondary-1 flex items-center gap-1">
									<Phone className="size-4" />
									Office Phone
								</span>
								{supplier.officePhone ? (
									<a
										href={`tel:${supplier.officePhone}`}
										className="text-sm text-blue-600 hover:underline"
									>
										{supplier.officePhone}
									</a>
								) : (
									<p className="text-sm">N/A</p>
								)}
							</div>
							<div className="space-y-2">
								<span className="block text-sm font-medium text-brand-secondary-1 flex items-center gap-1">
									<Mail className="size-4" />
									Email
								</span>
								{supplier.email ? (
									<a
										href={`mailto:${supplier.email}`}
										className="text-sm text-blue-600 hover:underline"
									>
										{supplier.email}
									</a>
								) : (
									<p className="text-sm">N/A</p>
								)}
							</div>
							<div className="space-y-2">
								<span className="block text-sm font-medium text-brand-secondary-1 flex items-center gap-1">
									<Globe className="size-4" />
									Website
								</span>
								{supplier.website ? (
									<a
										href={supplier.website}
										target="_blank"
										rel="noopener noreferrer"
										className="text-sm text-blue-600 hover:underline"
									>
										{supplier.website}
									</a>
								) : (
									<p className="text-sm">N/A</p>
								)}
							</div>
						</div>
					</div>

					<Separator />

					{/* System Information */}
					<div className="space-y-4">
						<h3 className="text-lg font-semibold flex items-center gap-2">
							<Hash className="size-5" />
							System Information
						</h3>
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div className="space-y-2">
								<span className="block text-sm font-medium text-brand-secondary-1 flex items-center gap-1">
									<Calendar className="size-4" />
									Created At
								</span>
								<p className="text-sm">{formatDate(supplier.createdAt)}</p>
							</div>
							<div className="space-y-2">
								<span className="block text-sm font-medium text-brand-secondary-1 flex items-center gap-1">
									<Calendar className="size-4" />
									Updated At
								</span>
								<p className="text-sm">{formatDate(supplier.updatedAt)}</p>
							</div>
							<div className="space-y-2">
								<span className="block text-sm font-medium text-brand-secondary-1">Supplier ID</span>
								<p className="text-sm font-mono text-brand-secondary-1">{supplier.id}</p>
							</div>
						</div>
					</div>
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={onClose}>
						Close
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
