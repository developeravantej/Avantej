import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { centsToRm } from "@/lib/money";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function formatCents(cents: number): string {
	return `RM ${centsToRm(cents)}`;
}
