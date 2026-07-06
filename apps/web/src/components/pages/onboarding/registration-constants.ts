// Shared constants for the member self-registration form.
// Ported from apps/native/components/registration-form.tsx — keep the two lists
// in sync when adding countries.

export type AddressType = "home" | "work";

export interface PersonalDetails {
	firstName: string;
	lastName: string;
	phone: string;
	email: string;
	idPassportNo: string;
	addressType: AddressType;
	streetAddress: string;
	city: string;
	state: string;
	country: string;
	postalCode: string;
	dateOfBirth: string; // yyyy-mm-dd (native <input type="date"> value)
}

export interface EmergencyContact {
	name: string;
	relationship: string;
	phone: string;
}

export interface BranchSelection {
	country: string;
	branchId: string;
	organizationId: string;
}

export const COUNTRY_FLAGS: Record<string, string> = {
	Malaysia: "🇲🇾",
	Thailand: "🇹🇭",
	Singapore: "🇸🇬",
	Indonesia: "🇮🇩",
	Philippines: "🇵🇭",
	Vietnam: "🇻🇳",
	Myanmar: "🇲🇲",
	Cambodia: "🇰🇭",
	Laos: "🇱🇦",
	Brunei: "🇧🇳",
	India: "🇮🇳",
	China: "🇨🇳",
	Japan: "🇯🇵",
	"South Korea": "🇰🇷",
	Taiwan: "🇹🇼",
	"Hong Kong": "🇭🇰",
	Australia: "🇦🇺",
	"New Zealand": "🇳🇿",
	"United States": "🇺🇸",
	"United Kingdom": "🇬🇧",
};

export interface CountryCode {
	code: string;
	dialCode: string;
	flag: string;
	name: string;
}

export const COUNTRY_CODES: CountryCode[] = [
	{ code: "MY", dialCode: "+60", flag: "🇲🇾", name: "Malaysia" },
	{ code: "SG", dialCode: "+65", flag: "🇸🇬", name: "Singapore" },
	{ code: "TH", dialCode: "+66", flag: "🇹🇭", name: "Thailand" },
	{ code: "ID", dialCode: "+62", flag: "🇮🇩", name: "Indonesia" },
	{ code: "PH", dialCode: "+63", flag: "🇵🇭", name: "Philippines" },
	{ code: "VN", dialCode: "+84", flag: "🇻🇳", name: "Vietnam" },
	{ code: "MM", dialCode: "+95", flag: "🇲🇲", name: "Myanmar" },
	{ code: "KH", dialCode: "+855", flag: "🇰🇭", name: "Cambodia" },
	{ code: "LA", dialCode: "+856", flag: "🇱🇦", name: "Laos" },
	{ code: "BN", dialCode: "+673", flag: "🇧🇳", name: "Brunei" },
	{ code: "IN", dialCode: "+91", flag: "🇮🇳", name: "India" },
	{ code: "CN", dialCode: "+86", flag: "🇨🇳", name: "China" },
	{ code: "JP", dialCode: "+81", flag: "🇯🇵", name: "Japan" },
	{ code: "KR", dialCode: "+82", flag: "🇰🇷", name: "South Korea" },
	{ code: "TW", dialCode: "+886", flag: "🇹🇼", name: "Taiwan" },
	{ code: "HK", dialCode: "+852", flag: "🇭🇰", name: "Hong Kong" },
	{ code: "AU", dialCode: "+61", flag: "🇦🇺", name: "Australia" },
	{ code: "NZ", dialCode: "+64", flag: "🇳🇿", name: "New Zealand" },
	{ code: "US", dialCode: "+1", flag: "🇺🇸", name: "United States" },
	{ code: "GB", dialCode: "+44", flag: "🇬🇧", name: "United Kingdom" },
	{ code: "CA", dialCode: "+1", flag: "🇨🇦", name: "Canada" },
	{ code: "DE", dialCode: "+49", flag: "🇩🇪", name: "Germany" },
	{ code: "FR", dialCode: "+33", flag: "🇫🇷", name: "France" },
	{ code: "IT", dialCode: "+39", flag: "🇮🇹", name: "Italy" },
	{ code: "ES", dialCode: "+34", flag: "🇪🇸", name: "Spain" },
	{ code: "NL", dialCode: "+31", flag: "🇳🇱", name: "Netherlands" },
	{ code: "AE", dialCode: "+971", flag: "🇦🇪", name: "UAE" },
	{ code: "SA", dialCode: "+966", flag: "🇸🇦", name: "Saudi Arabia" },
	{ code: "QA", dialCode: "+974", flag: "🇶🇦", name: "Qatar" },
	{ code: "BD", dialCode: "+880", flag: "🇧🇩", name: "Bangladesh" },
	{ code: "PK", dialCode: "+92", flag: "🇵🇰", name: "Pakistan" },
	{ code: "LK", dialCode: "+94", flag: "🇱🇰", name: "Sri Lanka" },
	{ code: "NP", dialCode: "+977", flag: "🇳🇵", name: "Nepal" },
	{ code: "BR", dialCode: "+55", flag: "🇧🇷", name: "Brazil" },
	{ code: "MX", dialCode: "+52", flag: "🇲🇽", name: "Mexico" },
	{ code: "ZA", dialCode: "+27", flag: "🇿🇦", name: "South Africa" },
	{ code: "NG", dialCode: "+234", flag: "🇳🇬", name: "Nigeria" },
	{ code: "KE", dialCode: "+254", flag: "🇰🇪", name: "Kenya" },
	{ code: "EG", dialCode: "+20", flag: "🇪🇬", name: "Egypt" },
	{ code: "RU", dialCode: "+7", flag: "🇷🇺", name: "Russia" },
	{ code: "SE", dialCode: "+46", flag: "🇸🇪", name: "Sweden" },
	{ code: "NO", dialCode: "+47", flag: "🇳🇴", name: "Norway" },
	{ code: "DK", dialCode: "+45", flag: "🇩🇰", name: "Denmark" },
	{ code: "FI", dialCode: "+358", flag: "🇫🇮", name: "Finland" },
	{ code: "CH", dialCode: "+41", flag: "🇨🇭", name: "Switzerland" },
	{ code: "AT", dialCode: "+43", flag: "🇦🇹", name: "Austria" },
	{ code: "PT", dialCode: "+351", flag: "🇵🇹", name: "Portugal" },
	{ code: "IE", dialCode: "+353", flag: "🇮🇪", name: "Ireland" },
	{ code: "PL", dialCode: "+48", flag: "🇵🇱", name: "Poland" },
	{ code: "TR", dialCode: "+90", flag: "🇹🇷", name: "Turkey" },
];

export const DEFAULT_COUNTRY = COUNTRY_CODES[0]; // Malaysia

const TIMEZONE_TO_COUNTRY: Record<string, string> = {
	"Asia/Kuala_Lumpur": "MY",
	"Asia/Singapore": "SG",
	"Asia/Bangkok": "TH",
	"Asia/Jakarta": "ID",
	"Asia/Makassar": "ID",
	"Asia/Jayapura": "ID",
	"Asia/Manila": "PH",
	"Asia/Ho_Chi_Minh": "VN",
	"Asia/Yangon": "MM",
	"Asia/Phnom_Penh": "KH",
	"Asia/Vientiane": "LA",
	"Asia/Brunei": "BN",
	"Asia/Kolkata": "IN",
	"Asia/Calcutta": "IN",
	"Asia/Shanghai": "CN",
	"Asia/Tokyo": "JP",
	"Asia/Seoul": "KR",
	"Asia/Taipei": "TW",
	"Asia/Hong_Kong": "HK",
	"Australia/Sydney": "AU",
	"Australia/Melbourne": "AU",
	"Australia/Brisbane": "AU",
	"Australia/Perth": "AU",
	"Pacific/Auckland": "NZ",
	"America/New_York": "US",
	"America/Chicago": "US",
	"America/Denver": "US",
	"America/Los_Angeles": "US",
	"Europe/London": "GB",
	"America/Toronto": "CA",
	"America/Vancouver": "CA",
	"Europe/Berlin": "DE",
	"Europe/Paris": "FR",
	"Europe/Rome": "IT",
	"Europe/Madrid": "ES",
	"Europe/Amsterdam": "NL",
	"Asia/Dubai": "AE",
	"Asia/Riyadh": "SA",
	"Asia/Qatar": "QA",
	"Asia/Dhaka": "BD",
	"Asia/Karachi": "PK",
	"Asia/Colombo": "LK",
	"Asia/Kathmandu": "NP",
	"America/Sao_Paulo": "BR",
	"America/Mexico_City": "MX",
	"Africa/Johannesburg": "ZA",
	"Africa/Lagos": "NG",
	"Africa/Nairobi": "KE",
	"Africa/Cairo": "EG",
	"Europe/Moscow": "RU",
	"Europe/Stockholm": "SE",
	"Europe/Oslo": "NO",
	"Europe/Copenhagen": "DK",
	"Europe/Helsinki": "FI",
	"Europe/Zurich": "CH",
	"Europe/Vienna": "AT",
	"Europe/Lisbon": "PT",
	"Europe/Dublin": "IE",
	"Europe/Warsaw": "PL",
	"Europe/Istanbul": "TR",
};

export function getDefaultCountry(): CountryCode {
	try {
		const { timeZone } = Intl.DateTimeFormat().resolvedOptions();
		if (timeZone) {
			const countryCode = TIMEZONE_TO_COUNTRY[timeZone];
			if (countryCode) {
				const found = COUNTRY_CODES.find((c) => c.code === countryCode);
				if (found) return found;
			}
		}
	} catch {
		// Intl not available
	}
	return DEFAULT_COUNTRY;
}
