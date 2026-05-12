import { Ionicons } from "@expo/vector-icons";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
	ActivityIndicator,
	Alert,
	Linking,
	Platform,
	ScrollView,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from "react-native";
import { WebView } from "react-native-webview";
import { Container } from "@/components/container";
import { colors } from "@/lib/colors";

/** Use local PDFs from assets/documents for offline viewing. */
const USE_LOCAL_PDF = true;

/** Fallback: remote Terms PDF URL when not using local file. Leave empty to use in-screen text if local fails. */
const TERMS_PDF_URL = "";

/** Map document id (from sign screen) to local PDF asset and display name. Use simple filenames so Metro can resolve require(). */
const DOCUMENT_ASSETS: Record<
	string,
	{ asset: number; name: string } | undefined
> = {
	agreement: {
		asset: require("@/assets/documents/agreement.pdf"),
		name: "Company–Client Agreement",
	},
	satisfaction: {
		asset: require("@/assets/documents/satisfaction-guarantee.pdf"),
		name: "100% Satisfaction Guarantee",
	},
	parq: {
		asset: require("@/assets/documents/parq.pdf"),
		name: "Par-Q & You",
	},
};

export default function TermsScreen() {
	const params = useLocalSearchParams<{ pdfUrl?: string; document?: string }>();
	const remotePdfUrl = params.pdfUrl ?? TERMS_PDF_URL;
	const documentId = params.document ?? "agreement";
	const documentConfig = DOCUMENT_ASSETS[documentId];
	const documentTitle = documentConfig?.name ?? "Terms & Conditions";

	const [pdfViewSource, setPdfViewSource] = useState<
		{ uri: string } | { html: string; baseUrl?: string } | null
	>(null);
	const [localPdfError, setLocalPdfError] = useState(false);

	const isNative = Platform.OS === "android" || Platform.OS === "ios";

	// Load bundled PDF. On native we open in system viewer immediately and go back; on web we use WebView.
	useEffect(() => {
		if (!USE_LOCAL_PDF || !documentConfig) {
			setPdfViewSource(null);
			return;
		}
		setPdfViewSource(null);
		setLocalPdfError(false);
		let cancelled = false;
		(async () => {
			try {
				const asset = Asset.fromModule(documentConfig.asset);
				await asset.downloadAsync();
				if (cancelled) return;
				const uri = asset.localUri;
				if (!uri) {
					console.warn("[Terms] PDF asset has no localUri after download");
					if (!cancelled) setLocalPdfError(true);
					return;
				}
				if (isNative) {
					// Open PDF in system viewer and go back (no button step)
					const openUri =
						Platform.OS === "android"
							? await FileSystem.getContentUriAsync(uri).catch(() => uri)
							: uri;
					if (cancelled) return;
					try {
						if (Platform.OS === "android") {
							await IntentLauncher.startActivityAsync(
								"android.intent.action.VIEW",
								{
									data: openUri,
									type: "application/pdf",
									flags: 1,
								},
							);
						} else {
							const can = await Linking.canOpenURL(openUri);
							if (can) await Linking.openURL(openUri);
							else
								Alert.alert(
									"Cannot open PDF",
									"No app is available to open this PDF.",
								);
						}
						router.back();
					} catch (e) {
						console.warn("[Terms] Open PDF failed:", e);
						Alert.alert(
							"Could not open PDF",
							Platform.OS === "android"
								? "Make sure a PDF viewer app is installed (e.g. Chrome, Google Drive)."
								: "No app could open this PDF.",
						);
						if (!cancelled) setLocalPdfError(true);
					}
				} else {
					const base64 = await FileSystem.readAsStringAsync(uri, {
						encoding: "base64",
					});
					if (cancelled) return;
					const dataUri = `data:application/pdf;base64,${base64}`;
					const html = `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0"/></head><body style="margin:0;height:100vh;"><embed src="${dataUri}" type="application/pdf" style="width:100%;height:100%;border:0;" /></body></html>`;
					setPdfViewSource({ html });
				}
			} catch (e) {
				console.warn("[Terms] Failed to load PDF:", documentId, e);
				if (!cancelled) setLocalPdfError(true);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [documentId, documentConfig, isNative]);

	const showPdf = Boolean(pdfViewSource || remotePdfUrl);

	// Prefer local PDF (as HTML with base64); fallback to remote URL
	const webViewSource = pdfViewSource
		? pdfViewSource
		: remotePdfUrl
			? {
					uri: `https://docs.google.com/viewer?url=${encodeURIComponent(remotePdfUrl)}&embedded=true`,
				}
			: null;

	// Loading: using local PDF but not ready yet (on native we open and go back, so this shows briefly)
	if (USE_LOCAL_PDF && !pdfViewSource && !localPdfError && !remotePdfUrl) {
		return (
			<Container>
				<View style={styles.pdfHeader}>
					<TouchableOpacity
						onPress={() => router.back()}
						className="mr-3 h-10 w-10 items-center justify-center"
					>
						<Ionicons name="arrow-back" size={24} color={colors.primary[1]} />
					</TouchableOpacity>
					<Text
						className="flex-1 font-bold text-2xl"
						style={{ color: colors.primary[1] }}
					>
						{documentTitle}
					</Text>
				</View>
				<View style={styles.loadingContainer}>
					<ActivityIndicator size="large" color={colors.primary[1]} />
					<Text style={[styles.loadingText, { color: colors.secondary[1] }]}>
						Loading…
					</Text>
				</View>
			</Container>
		);
	}

	if (showPdf && webViewSource) {
		return (
			<Container>
				<View style={styles.pdfHeader}>
					<TouchableOpacity
						onPress={() => router.back()}
						className="mr-3 h-10 w-10 items-center justify-center"
					>
						<Ionicons name="arrow-back" size={24} color={colors.primary[1]} />
					</TouchableOpacity>
					<Text
						className="flex-1 font-bold text-2xl"
						style={{ color: colors.primary[1] }}
					>
						{documentTitle}
					</Text>
				</View>
				<WebView
					source={webViewSource}
					style={styles.webview}
					scalesPageToFit
					originWhitelist={["*", "data:"]}
					onError={(e) => {
						console.warn("WebView PDF load error:", e.nativeEvent);
					}}
				/>
			</Container>
		);
	}

	return (
		<Container>
			<ScrollView
				className="flex-1 bg-secondary-3"
				contentContainerStyle={{ paddingBottom: 32 }}
				showsVerticalScrollIndicator={false}
			>
				{/* Header */}
				<View className="border-secondary-3 border-b bg-primary-2 px-4 pt-4 pb-4">
					<View className="flex-row items-center">
						<TouchableOpacity
							onPress={() => router.back()}
							className="mr-3 h-10 w-10 items-center justify-center"
						>
							<Ionicons name="arrow-back" size={24} color={colors.primary[1]} />
						</TouchableOpacity>
						<Text
							className="flex-1 font-bold text-2xl"
							style={{ color: colors.primary[1] }}
						>
							{documentTitle}
						</Text>
					</View>
				</View>

				<View className="px-4 pt-6">
					{/* Terms and Conditions of Service */}
					<View className="mb-8">
						<Text
							className="mb-3 font-bold text-lg"
							style={{ color: colors.primary[1] }}
						>
							1. Terms and Conditions of Service
						</Text>
						<Text
							className="mb-2 text-sm leading-6"
							style={{ color: colors.secondary[1] }}
						>
							By booking a session or purchasing a package, you agree to these
							Terms and Conditions. Our services include personal training,
							group classes, and wellness programmes as described at the time of
							booking.
						</Text>
						<Text
							className="mb-2 text-sm leading-6"
							style={{ color: colors.secondary[1] }}
						>
							You must be at least 18 years of age (or have parental consent) to
							use our services. Bookings are subject to availability and
							confirmed only after payment or confirmation is received.
						</Text>
						<Text
							className="text-sm leading-6"
							style={{ color: colors.secondary[1] }}
						>
							We reserve the right to refuse or cancel a booking if we believe
							it would breach these terms or pose a risk to you or others.
						</Text>
					</View>

					{/* Cancellation and Refund Policy */}
					<View className="mb-8">
						<Text
							className="mb-3 font-bold text-lg"
							style={{ color: colors.primary[1] }}
						>
							2. Cancellation and Refund Policy
						</Text>
						<Text
							className="mb-2 text-sm leading-6"
							style={{ color: colors.secondary[1] }}
						>
							<Text
								className="font-semibold"
								style={{ color: colors.primary[1] }}
							>
								Cancellations:{" "}
							</Text>
							Cancellations made at least 24 hours before the scheduled session
							are eligible for a full credit or reschedule. Cancellations made
							within 24 hours may forfeit the session or incur a fee.
						</Text>
						<Text
							className="mb-2 text-sm leading-6"
							style={{ color: colors.secondary[1] }}
						>
							<Text
								className="font-semibold"
								style={{ color: colors.primary[1] }}
							>
								Refunds:{" "}
							</Text>
							Package purchases may be refunded within 14 days of purchase if no
							sessions have been used. Used sessions are non-refundable. Refund
							requests must be submitted in writing.
						</Text>
						<Text
							className="text-sm leading-6"
							style={{ color: colors.secondary[1] }}
						>
							<Text
								className="font-semibold"
								style={{ color: colors.primary[1] }}
							>
								No-shows:{" "}
							</Text>
							If you do not attend a booked session without prior cancellation,
							the session may be counted as used and no credit will be issued.
						</Text>
					</View>

					{/* Health and Safety Waiver */}
					<View className="mb-8">
						<Text
							className="mb-3 font-bold text-lg"
							style={{ color: colors.primary[1] }}
						>
							3. Health and Safety Waiver
						</Text>
						<Text
							className="mb-2 text-sm leading-6"
							style={{ color: colors.secondary[1] }}
						>
							By participating in our programmes, you confirm that you are in
							good physical condition and have no known medical or health
							conditions that would prevent or limit your participation, unless
							disclosed to us in advance.
						</Text>
						<Text
							className="mb-2 text-sm leading-6"
							style={{ color: colors.secondary[1] }}
						>
							You agree to follow all safety instructions given by our trainers
							and staff. You participate at your own risk and release us from
							any liability for injury or loss arising from your participation,
							except where caused by our negligence.
						</Text>
						<Text
							className="text-sm leading-6"
							style={{ color: colors.secondary[1] }}
						>
							If you feel unwell or injured during a session, you must stop
							immediately and inform your trainer. We recommend consulting a
							doctor before starting any new fitness programme.
						</Text>
					</View>

					{/* Privacy Policy */}
					<View className="mb-8">
						<Text
							className="mb-3 font-bold text-lg"
							style={{ color: colors.primary[1] }}
						>
							4. Privacy Policy
						</Text>
						<Text
							className="mb-2 text-sm leading-6"
							style={{ color: colors.secondary[1] }}
						>
							We collect and use your personal data (name, contact details,
							health information where relevant, and payment details) only to
							provide our services, process bookings, and communicate with you.
						</Text>
						<Text
							className="mb-2 text-sm leading-6"
							style={{ color: colors.secondary[1] }}
						>
							Your data is stored securely and is not sold or shared with third
							parties for marketing purposes. We may share data with service
							providers (e.g. payment processors) only as necessary to deliver
							our services.
						</Text>
						<Text
							className="mb-2 text-sm leading-6"
							style={{ color: colors.secondary[1] }}
						>
							You have the right to access, correct, or delete your personal
							data. To exercise these rights or ask questions, contact us using
							the details provided in the app or on our website.
						</Text>
						<Text
							className="text-sm leading-6"
							style={{ color: colors.secondary[1] }}
						>
							By agreeing to these terms, you consent to the collection and use
							of your information as described in this Privacy Policy.
						</Text>
					</View>

					{/* Last updated */}
					<Text className="text-xs" style={{ color: colors.secondary[1] }}>
						Last updated: January 2025
					</Text>
				</View>
			</ScrollView>
		</Container>
	);
}

const styles = StyleSheet.create({
	pdfHeader: {
		flexDirection: "row",
		alignItems: "center",
		borderBottomWidth: 1,
		borderBottomColor: "#e5e7eb",
		backgroundColor: "white",
		paddingHorizontal: 16,
		paddingTop: 16,
		paddingBottom: 16,
	},
	webview: {
		flex: 1,
		backgroundColor: "#fff",
	},
	loadingContainer: {
		flex: 1,
		justifyContent: "center",
		alignItems: "center",
		gap: 12,
	},
	loadingText: {
		fontSize: 16,
	},
});
