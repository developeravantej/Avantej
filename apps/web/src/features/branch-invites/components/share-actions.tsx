import { Check, Copy, Download, Mail, MessageCircle } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface ShareActionsProps {
	url: string;
	branchName: string;
	/**
	 * Optional CSS selector for the QR <svg> to rasterise.
	 * Defaults to `[data-qr-download]`. If multiple QR codes are on the page,
	 * pass a more specific selector (e.g. `#qr-${id}`) so the right one is captured.
	 */
	qrSelector?: string;
	/** Visual density: compact = icon-only buttons, full = labelled buttons. */
	variant?: "compact" | "full";
}

function buildWhatsappUrl(url: string, branchName: string): string {
	const text = `Welcome to ${branchName}! Sign up here: ${url}`;
	return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

function buildMailtoUrl(url: string, branchName: string): string {
	const subject = `Sign up for ${branchName}`;
	const body = `Hi,\n\nScan the QR or open this link to create your account at ${branchName}:\n\n${url}\n\nSee you soon!`;
	return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function ShareActions({
	url,
	branchName,
	qrSelector = "[data-qr-download]",
	variant = "full",
}: ShareActionsProps) {
	const [copied, setCopied] = useState(false);

	const handleCopy = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(url);
			setCopied(true);
			toast.success("Link copied to clipboard.");
			setTimeout(() => setCopied(false), 2000);
		} catch {
			toast.error("Failed to copy link.");
		}
	}, [url]);

	const handleDownload = useCallback(() => {
		const svg = document.querySelector<SVGSVGElement>(qrSelector);
		if (!svg) {
			toast.error("Could not find QR element.");
			return;
		}

		const serialised = new XMLSerializer().serializeToString(svg);
		const blob = new Blob([serialised], { type: "image/svg+xml" });
		const objectUrl = URL.createObjectURL(blob);

		const img = new Image();
		img.onload = () => {
			const canvas = document.createElement("canvas");
			const size = 512;
			canvas.width = size;
			canvas.height = size;
			const ctx = canvas.getContext("2d");
			if (!ctx) return;
			ctx.fillStyle = "#fff";
			ctx.fillRect(0, 0, size, size);
			ctx.drawImage(img, 0, 0, size, size);
			URL.revokeObjectURL(objectUrl);

			canvas.toBlob((pngBlob) => {
				if (!pngBlob) return;
				const pngUrl = URL.createObjectURL(pngBlob);
				const a = document.createElement("a");
				a.href = pngUrl;
				a.download = `qr-${branchName.replace(/\s+/g, "-").toLowerCase()}.png`;
				a.click();
				URL.revokeObjectURL(pngUrl);
			}, "image/png");
		};
		img.src = objectUrl;
	}, [qrSelector, branchName]);

	const whatsappUrl = buildWhatsappUrl(url, branchName);
	const mailtoUrl = buildMailtoUrl(url, branchName);

	if (variant === "compact") {
		return (
			<div className="flex items-center gap-1">
				<Button
					variant="ghost"
					size="icon"
					className="h-7 w-7"
					title="Copy URL"
					onClick={handleCopy}
				>
					{copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
				</Button>
				<Button
					variant="ghost"
					size="icon"
					className="h-7 w-7"
					title="Download QR PNG"
					onClick={handleDownload}
				>
					<Download className="h-3.5 w-3.5" />
				</Button>
				<Button asChild variant="ghost" size="icon" className="h-7 w-7" title="Share via WhatsApp">
					<a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
						<MessageCircle className="h-3.5 w-3.5" />
					</a>
				</Button>
				<Button asChild variant="ghost" size="icon" className="h-7 w-7" title="Share via Email">
					<a href={mailtoUrl}>
						<Mail className="h-3.5 w-3.5" />
					</a>
				</Button>
			</div>
		);
	}

	return (
		<div className="flex flex-wrap gap-2">
			<Button variant="outline" size="sm" onClick={handleCopy} data-testid="share-copy-url">
				{copied ? (
					<Check className="mr-1.5 h-3.5 w-3.5" />
				) : (
					<Copy className="mr-1.5 h-3.5 w-3.5" />
				)}
				{copied ? "Copied" : "Copy URL"}
			</Button>
			<Button variant="outline" size="sm" onClick={handleDownload} data-testid="share-download-qr">
				<Download className="mr-1.5 h-3.5 w-3.5" />
				Download QR
			</Button>
			<Button asChild variant="outline" size="sm" data-testid="share-whatsapp">
				<a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
					<MessageCircle className="mr-1.5 h-3.5 w-3.5" />
					WhatsApp
				</a>
			</Button>
			<Button asChild variant="outline" size="sm" data-testid="share-email">
				<a href={mailtoUrl}>
					<Mail className="mr-1.5 h-3.5 w-3.5" />
					Email
				</a>
			</Button>
		</div>
	);
}
