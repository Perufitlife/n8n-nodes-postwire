import { createHmac, timingSafeEqual } from 'crypto';

/** Every event PostWire can send to an endpoint (GET /api/webhooks lists them too). */
export const EVENTS: Array<{ name: string; value: string; description: string }> = [
	{
		name: 'Approval Decided',
		value: 'approval.decided',
		description: 'Someone approved or rejected a post that was waiting for approval',
	},
	{
		name: 'Approval Requested',
		value: 'approval.requested',
		description: 'A post is held for a person before it goes out (brand rules, a key limit, a Contributor)',
	},
	{
		name: 'Connection Needs Sign-In',
		value: 'connection.reauth_required',
		description: 'A network says its sign-in expired or was revoked; the event carries the reconnect link',
	},
	{
		name: 'Post Failed',
		value: 'post.failed',
		description: 'A network refused the post or it could not be sent, with the reason and a code',
	},
	{
		name: 'Post Published',
		value: 'post.published',
		description: 'A network accepted the post (one event per network), with its ID and link',
	},
];

/** How old a signature may be, in seconds: PostWire signs each try when it sends it. */
export const TOLERANCE_SECONDS = 300;

/**
 * Checks a PostWire-Signature header: `t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>` (the scheme
 * Stripe uses). Returns null when the signature is good, or why it is not.
 */
export function signatureProblem(
	secret: string,
	rawBody: string | Buffer,
	header: string | undefined,
	nowMs: number = Date.now(),
	toleranceSeconds = TOLERANCE_SECONDS,
): string | null {
	if (!secret) return 'no signing secret is stored for this trigger; deactivate and activate the workflow again';
	if (!header) return 'the PostWire-Signature header is missing';
	const parts: Record<string, string> = {};
	for (const kv of String(header).split(',')) {
		const at = kv.indexOf('=');
		if (at > 0) parts[kv.slice(0, at).trim()] = kv.slice(at + 1).trim();
	}
	const t = Number(parts.t);
	if (!Number.isFinite(t) || t <= 0 || !parts.v1) return 'the PostWire-Signature header is malformed';
	if (Math.abs(nowMs / 1000 - t) > toleranceSeconds) return 'the signature is too old (more than 5 minutes)';
	const body = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody;
	const want = createHmac('sha256', secret).update(`${t}.`).update(body).digest('hex');
	const a = Buffer.from(want, 'utf8');
	const b = Buffer.from(parts.v1, 'utf8');
	if (a.length !== b.length || !timingSafeEqual(a, b)) return 'the signature does not match';
	return null;
}

/** Signs a body as PostWire does (used by the tests and by anyone replaying a delivery by hand). */
export function sign(secret: string, rawBody: string, t: number = Math.floor(Date.now() / 1000)): string {
	return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex')}`;
}

/** The networks an event is about: one for post.* and connection.*, several for approval.*. */
export function networksOf(data: Record<string, unknown> | undefined): string[] {
	if (!data) return [];
	if (typeof data.platform === 'string') return [data.platform];
	const lists = ['platforms', 'approved_platforms', 'rejected_platforms'].flatMap((k) =>
		Array.isArray(data[k]) ? (data[k] as unknown[]).map(String) : [],
	);
	return [...new Set(lists)];
}
