import { z } from "zod";

export const sourceSchema = z.enum(["assigned", "purchased"]);
export const paymentStatusSchema = z.enum([
	"pending",
	"paid",
	"failed",
	"refunded",
	"partially_paid",
]);
export const statusSchema = z.enum([
	"pending",
	"active",
	"frozen",
	"completed",
	"expired",
	"exhausted",
	"cancelled",
]);

/** When `"true"` (default), customer-purchased packages start in `pending` until trainer assignment. */
export const PACKAGE_APPROVAL_REQUIRED_KEY = "package_approval.required";
