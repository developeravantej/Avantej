import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type CreateProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	newName: string;
	setNewName: (v: string) => void;
	newNotes: string;
	setNewNotes: (v: string) => void;
	makePrimary: boolean;
	setMakePrimary: (v: boolean) => void;
	submitError: string | null;
	onCreate: () => void;
	isPending: boolean;
};

export function CreateHouseholdDialog({
	open,
	onOpenChange,
	newName,
	setNewName,
	newNotes,
	setNewNotes,
	makePrimary,
	setMakePrimary,
	submitError,
	onCreate,
	isPending,
}: CreateProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Create household</DialogTitle>
					<DialogDescription>
						Group this customer with family members under one household.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4 py-2">
					<div className="space-y-1.5">
						<Label htmlFor="hh-name">Name</Label>
						<Input
							id="hh-name"
							value={newName}
							onChange={(e) => setNewName(e.target.value)}
							placeholder="e.g. The Tan Family"
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="hh-notes">Notes (optional)</Label>
						<Textarea
							id="hh-notes"
							value={newNotes}
							onChange={(e) => setNewNotes(e.target.value)}
							placeholder="Any context about the household."
						/>
					</div>
					<div className="flex items-center gap-2">
						<Checkbox
							id="hh-primary"
							checked={makePrimary}
							onCheckedChange={(c) => setMakePrimary(c === true)}
						/>
						<Label htmlFor="hh-primary" className="font-normal">
							Make this customer the primary contact
						</Label>
					</div>
					{submitError && (
						<Alert variant="destructive">
							<AlertDescription>{submitError}</AlertDescription>
						</Alert>
					)}
				</div>
				<DialogFooter>
					<Button
						type="button"
						variant="ghost"
						onClick={() => onOpenChange(false)}
						disabled={isPending}
					>
						Cancel
					</Button>
					<Button
						type="button"
						onClick={onCreate}
						disabled={isPending || !newName.trim()}
					>
						{isPending ? "Creating…" : "Create"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

type AttachProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	pickedHouseholdId: string;
	setPickedHouseholdId: (v: string) => void;
	allHouseholds: Array<{ id: string; name: string }>;
	submitError: string | null;
	onAttach: () => void;
	isPending: boolean;
};

export function AttachHouseholdDialog({
	open,
	onOpenChange,
	pickedHouseholdId,
	setPickedHouseholdId,
	allHouseholds,
	submitError,
	onAttach,
	isPending,
}: AttachProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Attach to household</DialogTitle>
					<DialogDescription>
						Pick an existing household to add this customer to.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4 py-2">
					<div className="space-y-1.5">
						<Label htmlFor="hh-pick">Household</Label>
						<Select
							value={pickedHouseholdId}
							onValueChange={setPickedHouseholdId}
						>
							<SelectTrigger id="hh-pick">
								<SelectValue placeholder="Select a household" />
							</SelectTrigger>
							<SelectContent>
								{allHouseholds.length === 0 ? (
									<SelectItem value="__none__" disabled>
										No households yet
									</SelectItem>
								) : (
									allHouseholds.map((h) => (
										<SelectItem key={h.id} value={h.id}>
											{h.name}
										</SelectItem>
									))
								)}
							</SelectContent>
						</Select>
					</div>
					{submitError && (
						<Alert variant="destructive">
							<AlertDescription>{submitError}</AlertDescription>
						</Alert>
					)}
				</div>
				<DialogFooter>
					<Button
						type="button"
						variant="ghost"
						onClick={() => onOpenChange(false)}
						disabled={isPending}
					>
						Cancel
					</Button>
					<Button
						type="button"
						onClick={onAttach}
						disabled={isPending || !pickedHouseholdId}
					>
						{isPending ? "Attaching…" : "Attach"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
