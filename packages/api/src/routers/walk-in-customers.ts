import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure } from "../index";

const deprecated = (message: string) =>
	protectedProcedure
		.input(z.any().optional())
		.handler(() => {
			throw new ORPCError("BAD_REQUEST", { message });
		});

export const walkInCustomersRouter = {
	list: protectedProcedure
		.input(z.any().optional())
		.handler(() => ({ items: [], total: 0 })),
	getById: deprecated("Walk-in customers have been removed"),
	create: deprecated(
		"Walk-in customers have been removed — use anonymous walk-in flow",
	),
	update: deprecated("Walk-in customers have been removed"),
	deactivate: deprecated("Walk-in customers have been removed"),
};
