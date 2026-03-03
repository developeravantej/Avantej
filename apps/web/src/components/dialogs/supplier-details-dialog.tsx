import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Phone, Mail, Globe, User, Building, Calendar, Hash } from "lucide-react";

export interface SupplierDetails {
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
			<DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
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
							<Building className="h-5 w-5" />
							Basic Information
						</h3>
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div className="space-y-2">
								<label className="text-sm font-medium text-gray-500">Description</label>
								<p className="text-sm">{supplier.description || "N/A"}</p>
							</div>
							<div className="space-y-2">
								<label className="text-sm font-medium text-gray-500">Account Number</label>
								<p className="text-sm font-mono">{supplier.accountNumber || "N/A"}</p>
							</div>
							<div className="space-y-2">
								<label className="text-sm font-medium text-gray-500">Payment Terms</label>
								<p className="text-sm">{supplier.paymentTerms || "N/A"}</p>
							</div>
							<div className="space-y-2">
								<label className="text-sm font-medium text-gray-500">Barcode</label>
								<p className="text-sm font-mono">{supplier.barcode || "N/A"}</p>
							</div>
						</div>
					</div>

					<Separator />

					{/* Contact Information */}
					<div className="space-y-4">
						<h3 className="text-lg font-semibold flex items-center gap-2">
							<User className="h-5 w-5" />
							Contact Information
						</h3>
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div className="space-y-2">
								<label className="text-sm font-medium text-gray-500">Contact Person</label>
								<p className="text-sm">{supplier.contactPerson || "N/A"}</p>
							</div>
							<div className="space-y-2">
								<label className="text-sm font-medium text-gray-500 flex items-center gap-1">
									<Phone className="h-4 w-4" />
									Mobile
								</label>
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
								<label className="text-sm font-medium text-gray-500 flex items-center gap-1">
									<Phone className="h-4 w-4" />
									Office Phone
								</label>
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
								<label className="text-sm font-medium text-gray-500 flex items-center gap-1">
									<Mail className="h-4 w-4" />
									Email
								</label>
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
								<label className="text-sm font-medium text-gray-500 flex items-center gap-1">
									<Globe className="h-4 w-4" />
									Website
								</label>
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
							<Hash className="h-5 w-5" />
							System Information
						</h3>
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div className="space-y-2">
								<label className="text-sm font-medium text-gray-500 flex items-center gap-1">
									<Calendar className="h-4 w-4" />
									Created At
								</label>
								<p className="text-sm">{formatDate(supplier.createdAt)}</p>
							</div>
							<div className="space-y-2">
								<label className="text-sm font-medium text-gray-500 flex items-center gap-1">
									<Calendar className="h-4 w-4" />
									Updated At
								</label>
								<p className="text-sm">{formatDate(supplier.updatedAt)}</p>
							</div>
							<div className="space-y-2">
								<label className="text-sm font-medium text-gray-500">Supplier ID</label>
								<p className="text-sm font-mono text-gray-600">{supplier.id}</p>
							</div>
						</div>
					</div>
				</div>

				<div className="flex justify-end gap-2 pt-4">
					<Button variant="outline" onClick={onClose}>
						Close
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
