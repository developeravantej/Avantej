"use client";

import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { ChevronDown } from "lucide-react";
import type * as React from "react";

import { cn } from "@/lib/utils";

const Accordion = AccordionPrimitive.Root;

function AccordionItem({
	className,
	ref,
	...props
}: React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item> & {
	ref?: React.Ref<React.ElementRef<typeof AccordionPrimitive.Item>>;
}) {
	return (
		<AccordionPrimitive.Item
			ref={ref}
			className={cn("border-b", className)}
			{...props}
		/>
	);
}

function AccordionTrigger({
	className,
	children,
	ref,
	...props
}: React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger> & {
	ref?: React.Ref<React.ElementRef<typeof AccordionPrimitive.Trigger>>;
}) {
	return (
		<AccordionPrimitive.Header className="flex">
			<AccordionPrimitive.Trigger
				ref={ref}
				className={cn(
					"flex flex-1 items-center justify-between py-4 font-medium transition-all hover:underline [&[data-state=open]>svg]:rotate-180",
					className,
				)}
				{...props}
			>
				{children}
				<ChevronDown className="size-4 shrink-0 transition-transform duration-200" />
			</AccordionPrimitive.Trigger>
		</AccordionPrimitive.Header>
	);
}

function AccordionContent({
	className,
	children,
	ref,
	...props
}: React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content> & {
	ref?: React.Ref<React.ElementRef<typeof AccordionPrimitive.Content>>;
}) {
	return (
		<AccordionPrimitive.Content
			ref={ref}
			className="overflow-hidden text-sm"
			{...props}
		>
			<div className={cn("pt-0 pb-4", className)}>{children}</div>
		</AccordionPrimitive.Content>
	);
}

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger };
