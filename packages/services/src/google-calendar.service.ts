// packages/services/src/google-calendar.service.ts

interface GoogleTokenResponse {
	access_token: string;
	refresh_token?: string;
	expires_in: number;
	token_type: string;
	scope: string;
}

interface GoogleUserInfo {
	email: string;
	name?: string;
}

export interface CalendarEvent {
	summary: string;
	description?: string;
	location?: string;
	start: { dateTime: string; timeZone: string };
	end: { dateTime: string; timeZone: string };
}

export function getGoogleAuthUrl(params: {
	clientId: string;
	redirectUri: string;
	state: string;
}): string {
	const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
	url.searchParams.set("client_id", params.clientId);
	url.searchParams.set("redirect_uri", params.redirectUri);
	url.searchParams.set("response_type", "code");
	url.searchParams.set(
		"scope",
		"https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email",
	);
	url.searchParams.set("access_type", "offline");
	url.searchParams.set("prompt", "consent");
	url.searchParams.set("state", params.state);
	return url.toString();
}

export async function exchangeCodeForTokens(params: {
	code: string;
	clientId: string;
	clientSecret: string;
	redirectUri: string;
}): Promise<GoogleTokenResponse> {
	const res = await fetch("https://oauth2.googleapis.com/token", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			code: params.code,
			client_id: params.clientId,
			client_secret: params.clientSecret,
			redirect_uri: params.redirectUri,
			grant_type: "authorization_code",
		}),
	});
	if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
	return res.json() as Promise<GoogleTokenResponse>;
}

export async function refreshAccessToken(params: {
	refreshToken: string;
	clientId: string;
	clientSecret: string;
}): Promise<{ access_token: string; expires_in: number }> {
	const res = await fetch("https://oauth2.googleapis.com/token", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			refresh_token: params.refreshToken,
			client_id: params.clientId,
			client_secret: params.clientSecret,
			grant_type: "refresh_token",
		}),
	});
	if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);
	return res.json() as Promise<{ access_token: string; expires_in: number }>;
}

export async function getGoogleUserInfo(
	accessToken: string,
): Promise<GoogleUserInfo> {
	const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
		headers: { Authorization: `Bearer ${accessToken}` },
	});
	if (!res.ok) throw new Error(`User info fetch failed: ${await res.text()}`);
	return res.json() as Promise<GoogleUserInfo>;
}

export async function revokeGoogleToken(token: string): Promise<void> {
	await fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
	});
	// Don't throw on revoke failure — token may already be invalid
}

export async function createCalendarEvent(
	accessToken: string,
	calendarId: string,
	event: CalendarEvent,
): Promise<string> {
	const res = await fetch(
		`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(event),
		},
	);
	if (!res.ok) throw new Error(`Create event failed: ${await res.text()}`);
	const data = (await res.json()) as { id: string };
	return data.id;
}

export async function updateCalendarEvent(
	accessToken: string,
	calendarId: string,
	eventId: string,
	event: Partial<CalendarEvent>,
): Promise<void> {
	const res = await fetch(
		`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
		{
			method: "PUT",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(event),
		},
	);
	if (!res.ok) throw new Error(`Update event failed: ${await res.text()}`);
}

export async function deleteCalendarEvent(
	accessToken: string,
	calendarId: string,
	eventId: string,
): Promise<void> {
	const res = await fetch(
		`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
		{
			method: "DELETE",
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		},
	);
	// 404 is OK — event may already be deleted
	if (!res.ok && res.status !== 404)
		throw new Error(`Delete event failed: ${await res.text()}`);
}

// ---------------------------------------------------------------------------
// Read events (Google -> Avantej pull-sync, UAT §6)
// ---------------------------------------------------------------------------

export interface GoogleCalendarEvent {
	id: string;
	summary?: string;
	status?: string; // "confirmed" | "tentative" | "cancelled"
	transparency?: string; // "opaque" (busy) | "transparent" (free)
	start: { dateTime?: string; date?: string };
	end: { dateTime?: string; date?: string };
}

/**
 * List events in [timeMin, timeMax) on a calendar, expanding recurrences into
 * single instances (singleEvents=true) so each busy interval is concrete. Used by
 * the pull-sync to mirror Google busy times into Avantej availability.
 */
export async function listCalendarEvents(
	accessToken: string,
	calendarId: string,
	timeMin: Date,
	timeMax: Date,
): Promise<GoogleCalendarEvent[]> {
	const params = new URLSearchParams({
		timeMin: timeMin.toISOString(),
		timeMax: timeMax.toISOString(),
		singleEvents: "true",
		orderBy: "startTime",
		maxResults: "2500",
	});
	const res = await fetch(
		`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
			calendarId,
		)}/events?${params.toString()}`,
		{ headers: { Authorization: `Bearer ${accessToken}` } },
	);
	if (!res.ok) throw new Error(`List events failed: ${await res.text()}`);
	const data = (await res.json()) as { items?: GoogleCalendarEvent[] };
	return data.items ?? [];
}

// ---------------------------------------------------------------------------
// Calendar list (Task 1.30)
// ---------------------------------------------------------------------------

export interface GoogleCalendarListEntry {
	id: string;
	summary: string;
	description?: string;
	primary: boolean;
	accessRole: string;
	backgroundColor?: string;
}

export async function listGoogleCalendars(
	accessToken: string,
): Promise<GoogleCalendarListEntry[]> {
	const res = await fetch(
		"https://www.googleapis.com/calendar/v3/users/me/calendarList",
		{
			headers: { Authorization: `Bearer ${accessToken}` },
		},
	);
	if (!res.ok)
		throw new Error(`Calendar list fetch failed: ${await res.text()}`);
	const data = (await res.json()) as { items?: GoogleCalendarListEntry[] };
	return (data.items ?? []).map((item) => ({
		id: item.id,
		summary: item.summary,
		description: item.description,
		primary: item.primary ?? false,
		accessRole: item.accessRole,
		backgroundColor: item.backgroundColor,
	}));
}

// ---------------------------------------------------------------------------
// syncNow in-memory rate-limit store (Task 1.18)
// One entry per memberId; reset on process restart (acceptable for Cloudflare Workers).
// ---------------------------------------------------------------------------
const syncNowLastCalled = new Map<string, number>();
const SYNC_NOW_COOLDOWN_MS = 60_000;

export function checkSyncNowRateLimit(memberId: string): boolean {
	const last = syncNowLastCalled.get(memberId);
	if (last !== undefined && Date.now() - last < SYNC_NOW_COOLDOWN_MS) {
		return false; // rate-limited
	}
	syncNowLastCalled.set(memberId, Date.now());
	return true; // allowed
}
