/**
 * Test-only Neon branch provisioning for isolated integration runs.
 *
 * A Neon branch is a copy-on-write clone of its parent branch: it inherits the
 * full schema AND all data instantly, so a per-run branch gives the integration
 * suite a private, fully-seeded database without any migration or seed step.
 * This removes the lock/fixture contention that occurs when a dev server or a
 * concurrent session touches the shared dev DB at the same time as the tests.
 *
 * NOT bundled into the Cloudflare Worker — lives under tests/ and is only
 * imported by the test preload. Uses the Neon REST API (NEON_API_KEY).
 *
 * Scope note (v1): only the TENANT project is branched. The control-panel DB is
 * effectively read-only across the suite (only auth-email/org write to it, and
 * each creates+deletes its own user), and it lives in a different Neon account
 * than NEON_API_KEY can reach. Control-panel isolation is a documented follow-up.
 */

const NEON_API = "https://console.neon.tech/api/v2";

function headers(apiKey: string) {
	return {
		Authorization: `Bearer ${apiKey}`,
		"Content-Type": "application/json",
	};
}

export interface TestBranch {
	projectId: string;
	branchId: string;
	connectionUri: string;
}

/**
 * Create a read/write branch off the project's default branch and return a
 * ready-to-use connection URI. Throws on any non-2xx so the run fails fast.
 */
export async function createTestBranch(opts: {
	apiKey: string;
	projectId: string;
	name: string;
}): Promise<TestBranch> {
	const res = await fetch(`${NEON_API}/projects/${opts.projectId}/branches`, {
		method: "POST",
		headers: headers(opts.apiKey),
		body: JSON.stringify({
			branch: { name: opts.name },
			endpoints: [{ type: "read_write" }],
		}),
	});
	const json = (await res.json()) as {
		branch?: { id?: string };
		connection_uris?: Array<{ connection_uri?: string }>;
	};
	if (!res.ok) {
		throw new Error(
			`Neon createTestBranch failed (${res.status}): ${JSON.stringify(json)}`,
		);
	}
	const branchId = json.branch?.id;
	const connectionUri = json.connection_uris?.[0]?.connection_uri;
	if (!branchId || !connectionUri) {
		throw new Error(
			`Neon createTestBranch returned no branch id / connection_uri: ${JSON.stringify(json)}`,
		);
	}
	return { projectId: opts.projectId, branchId, connectionUri };
}

/**
 * Delete a branch. 404 is treated as success (already gone). Other failures
 * throw so the caller can decide whether to swallow (teardown does).
 */
export async function deleteTestBranch(opts: {
	apiKey: string;
	projectId: string;
	branchId: string;
}): Promise<void> {
	const res = await fetch(
		`${NEON_API}/projects/${opts.projectId}/branches/${opts.branchId}`,
		{ method: "DELETE", headers: headers(opts.apiKey) },
	);
	if (!res.ok && res.status !== 404) {
		const body = await res.text().catch(() => "");
		throw new Error(`Neon deleteTestBranch failed (${res.status}): ${body}`);
	}
}

/**
 * List branches whose name starts with `prefix` (default `itest-`). Used by the
 * orphan-cleanup script to sweep branches left behind by killed runs.
 */
export async function listTestBranches(opts: {
	apiKey: string;
	projectId: string;
	prefix?: string;
}): Promise<Array<{ id: string; name: string; createdAt: string }>> {
	const res = await fetch(`${NEON_API}/projects/${opts.projectId}/branches`, {
		headers: headers(opts.apiKey),
	});
	const json = (await res.json()) as {
		branches?: Array<{ id: string; name: string; created_at: string }>;
	};
	if (!res.ok) {
		throw new Error(`Neon listTestBranches failed (${res.status})`);
	}
	const prefix = opts.prefix ?? "itest-";
	return (json.branches ?? [])
		.filter((b) => (b.name ?? "").startsWith(prefix))
		.map((b) => ({ id: b.id, name: b.name, createdAt: b.created_at }));
}
