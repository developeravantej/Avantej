import { Dialog, Transition } from "@headlessui/react";
import { Fragment, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

export interface ServiceFormData {
	id?: string;
	name: string;
	categoryId: string | null;
	duration: number;
	durationUnitType: "seconds" | "minutes" | "hours";
	maxAttendees: number;
	price: number | null;
	schedulingType: "appointment" | "class_slot";
	isActive: boolean;
}

interface ServiceCreateEditDialogProps {
	isOpen: boolean;
	onClose: () => void;
	onSuccess: () => void;
	organizationId: string;
	mode: "create" | "edit";
	initialData?: ServiceFormData | null;
	categories: { id: string; name: string }[];
}

export function ServiceCreateEditDialog({
	isOpen,
	onClose,
	onSuccess,
	organizationId,
	mode,
	initialData,
	categories,
}: ServiceCreateEditDialogProps) {
	const [name, setName] = useState("");
	const [categoryId, setCategoryId] = useState<string>("");
	const [duration, setDuration] = useState(60);
	const [durationUnitType, setDurationUnitType] = useState<"seconds" | "minutes" | "hours">("minutes");
	const [maxAttendees, setMaxAttendees] = useState(1);
	const [price, setPrice] = useState("");
	const [schedulingType, setSchedulingType] = useState<"appointment" | "class_slot">("appointment");
	const [isActive, setIsActive] = useState(true);
	const [isSubmitting, setIsSubmitting] = useState(false);

	useEffect(() => {
		if (isOpen) {
			if (mode === "edit" && initialData) {
				setName(initialData.name);
				setCategoryId(initialData.categoryId ?? "");
				setDuration(initialData.duration);
				setDurationUnitType(initialData.durationUnitType ?? "minutes");
				setMaxAttendees(initialData.maxAttendees ?? 1);
				setPrice(initialData.price != null ? String(initialData.price / 100) : "");
				setSchedulingType(initialData.schedulingType ?? "appointment");
				setIsActive(initialData.isActive ?? true);
			} else {
				setName("");
				setCategoryId("");
				setDuration(60);
				setDurationUnitType("minutes");
				setMaxAttendees(1);
				setPrice("");
				setSchedulingType("appointment");
				setIsActive(true);
			}
		}
	}, [isOpen, mode, initialData]);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!name.trim()) {
			toast.error("Name is required");
			return;
		}
		if (maxAttendees < 0) {
			toast.error("Max attendees must be 0 or more");
			return;
		}
		setIsSubmitting(true);
		try {
			const { client } = await import("@/utils/orpc");
			const priceCents = price.trim() ? Math.round(parseFloat(price) * 100) : null;
			if (mode === "create") {
				await client.services.create({
					organizationId,
					name: name.trim(),
					categoryId: categoryId || null,
					duration,
					durationUnitType,
					maxAttendees,
					price: priceCents,
					schedulingType,
					isActive,
				});
				toast.success("Service created");
			} else if (initialData?.id) {
				await client.services.update({
					organizationId,
					id: initialData.id,
					name: name.trim(),
					categoryId: categoryId || null,
					duration,
					durationUnitType,
					maxAttendees,
					price: priceCents,
					schedulingType,
					isActive,
				});
				toast.success("Service updated");
			}
			onSuccess();
			onClose();
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : "Something went wrong";
			toast.error(message);
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<Transition appear show={isOpen} as={Fragment}>
			<Dialog as="div" className="relative z-10" onClose={onClose}>
				<Transition.Child
					as={Fragment}
					enter="ease-out duration-300"
					enterFrom="opacity-0"
					enterTo="opacity-100"
					leave="ease-in duration-200"
					leaveFrom="opacity-100"
					leaveTo="opacity-0"
				>
					<div className="fixed inset-0 bg-brand-primary-1/50" />
				</Transition.Child>
				<div className="fixed inset-0 overflow-y-auto">
					<div className="flex min-h-full items-center justify-center p-4">
						<Transition.Child
							as={Fragment}
							enter="ease-out duration-300"
							enterFrom="opacity-0 scale-95"
							enterTo="opacity-100 scale-100"
							leave="ease-in duration-200"
							leaveFrom="opacity-100 scale-100"
							leaveTo="opacity-0 scale-95"
						>
							<Dialog.Panel className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
								<Dialog.Title className="text-lg font-semibold">
									{mode === "create" ? "Add Service" : "Edit Service"}
								</Dialog.Title>
								<form onSubmit={handleSubmit} className="mt-4 space-y-4">
									<div>
										<Label htmlFor="name">Name *</Label>
										<Input
											id="name"
											value={name}
											onChange={(e) => setName(e.target.value)}
											placeholder="Service name"
											className="mt-1"
										/>
									</div>
									<div>
										<Label>Category</Label>
										<Select value={categoryId || "none"} onValueChange={(v) => setCategoryId(v === "none" ? "" : v)}>
											<SelectTrigger className="mt-1">
												<SelectValue placeholder="Select category" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="none">— None —</SelectItem>
												{categories.map((c) => (
													<SelectItem key={c.id} value={c.id}>
														{c.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									</div>
									<div className="grid grid-cols-2 gap-4">
										<div>
											<Label htmlFor="duration">Duration *</Label>
											<Input
												id="duration"
												type="number"
												min={1}
												value={duration}
												onChange={(e) => setDuration(Number(e.target.value) || 1)}
												className="mt-1"
											/>
										</div>
										<div>
											<Label>Unit</Label>
											<Select
												value={durationUnitType}
												onValueChange={(v) => setDurationUnitType(v as "seconds" | "minutes" | "hours")}
											>
												<SelectTrigger className="mt-1">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="seconds">Seconds</SelectItem>
													<SelectItem value="minutes">Minutes</SelectItem>
													<SelectItem value="hours">Hours</SelectItem>
												</SelectContent>
											</Select>
										</div>
									</div>
									<div>
										<Label htmlFor="maxAttendees">Max attendees *</Label>
										<Input
											id="maxAttendees"
											type="number"
											min={0}
											value={maxAttendees}
											onChange={(e) => setMaxAttendees(Number(e.target.value) || 0)}
											className="mt-1"
										/>
									</div>
									<div>
										<Label htmlFor="price">Price (USD)</Label>
										<Input
											id="price"
											type="number"
											min={0}
											step={0.01}
											value={price}
											onChange={(e) => setPrice(e.target.value)}
											placeholder="e.g. 25.00"
											className="mt-1"
										/>
									</div>
									<div>
										<Label>Scheduling type</Label>
										<Select
											value={schedulingType}
											onValueChange={(v) => setSchedulingType(v as "appointment" | "class_slot")}
										>
											<SelectTrigger className="mt-1">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="appointment">Appointment</SelectItem>
												<SelectItem value="class_slot">Class slot</SelectItem>
											</SelectContent>
										</Select>
									</div>
									<div className="flex items-center gap-2">
										<input
											type="checkbox"
											id="isActive"
											checked={isActive}
											onChange={(e) => setIsActive(e.target.checked)}
											className="h-4 w-4 rounded border-brand-secondary-3"
										/>
										<Label htmlFor="isActive">Active</Label>
									</div>
									<div className="flex justify-end gap-2 pt-2">
										<Button type="button" variant="outline" onClick={onClose}>
											Cancel
										</Button>
										<Button type="submit" disabled={isSubmitting}>
											{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
											{mode === "create" ? "Create" : "Save"}
										</Button>
									</div>
								</form>
							</Dialog.Panel>
						</Transition.Child>
					</div>
				</div>
			</Dialog>
		</Transition>
	);
}
