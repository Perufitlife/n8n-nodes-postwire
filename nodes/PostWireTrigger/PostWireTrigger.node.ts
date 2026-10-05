import {
	NodeApiError,
	NodeConnectionTypes,
	NodeOperationError,
	type IDataObject,
	type IHookFunctions,
	type INodeType,
	type INodeTypeDescription,
	type IWebhookFunctions,
	type IWebhookResponseData,
	type JsonObject,
} from 'n8n-workflow';

import { apiRequest, PLATFORMS } from '../PostWire/GenericFunctions';
import { EVENTS, networksOf, signatureProblem } from './WebhookFunctions';

type StoredWebhook = { webhookId?: string; secret?: string; events?: string[] };

// What PostWire needs to be able to call: a public https address. Checked before the request so the reason is the
// n8n setting to change, not "url must use https" from the API.
function urlProblem(url: string): string | null {
	let u: URL;
	try {
		u = new URL(url);
	} catch {
		return `n8n gave the webhook URL "${url}", which is not a full address`;
	}
	if (u.protocol !== 'https:') return `n8n's webhook URL is ${url}, and PostWire only calls https addresses`;
	if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|\[?::1\]?$)/i.test(u.hostname) || !u.hostname.includes('.'))
		return `n8n's webhook URL is ${url}, which PostWire cannot reach from the internet`;
	return null;
}

const sameEvents = (a: unknown, b: string[]) =>
	Array.isArray(a) && [...(a as string[])].sort().join() === [...b].sort().join();

export class PostWireTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'PostWire Trigger',
		name: 'postWireTrigger',
		icon: { light: 'file:postwire.svg', dark: 'file:postwire.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{($parameter["events"] || []).join(", ")}}',
		description:
			'Starts the workflow when a post is published or fails on a network, a connection needs signing in again, or a post waits for approval or gets a decision',
		defaults: { name: 'PostWire Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'postWireApi', required: true }],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName:
					'PostWire calls this workflow from the internet, so n8n must be reachable at a public https address. When the workflow is activated the node adds a signed webhook to your PostWire account; when it is deactivated, the node removes it.',
				name: 'notice',
				type: 'notice',
				default: '',
			},
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				required: true,
				default: ['post.published', 'post.failed'],
				options: EVENTS.map((e) => ({ name: e.name, value: e.value, description: e.description })),
				description:
					'What starts the workflow. Post events come one per network: a post to three networks that worked on two sends two Post Published and one Post Failed.',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				options: [
					{
						displayName: 'Brand ID',
						name: 'brandId',
						type: 'string',
						default: '',
						placeholder: 'e.g. 3f1c2a9e-8b7d-4c2e-9a51-0d6f2b7c1e44',
						description: 'Only events for this brand (the ID from PostWire → Brand → Get Many)',
					},
					{
						displayName: 'Networks',
						name: 'networks',
						type: 'multiOptions',
						options: PLATFORMS.filter((p) => p.value !== 'reddit').map((p) => ({ name: p.name, value: p.value })),
						default: [],
						description: 'Only events about these networks. Leave empty for all.',
					},
				],
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node') as StoredWebhook;
				if (!data.webhookId || !data.secret) return false;
				const url = this.getNodeWebhookUrl('default') as string;
				const events = this.getNodeParameter('events', []) as string[];
				const res = await apiRequest.call(this, 'GET', '/api/webhooks');
				const hook = ((res.webhooks as IDataObject[]) || []).find((h) => h.id === data.webhookId);
				// Gone, pointing elsewhere, switched off or listening to other events: create() makes a fresh one.
				if (!hook || hook.url !== url || hook.active === false || !sameEvents(hook.events, events)) {
					delete data.webhookId;
					delete data.secret;
					delete data.events;
					return false;
				}
				return true;
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const url = this.getNodeWebhookUrl('default') as string;
				const why = urlProblem(url);
				if (why)
					throw new NodeOperationError(this.getNode(), 'PostWire cannot reach this n8n instance', {
						description: `${why}. Set n8n's WEBHOOK_URL environment variable to the instance's public https address (or start n8n with a tunnel), then activate the workflow again.`,
					});
				const events = this.getNodeParameter('events', []) as string[];
				if (!events.length)
					throw new NodeOperationError(this.getNode(), "No event selected in 'Events'", {
						description: 'Pick at least one event to listen to.',
					});
				const data = this.getWorkflowStaticData('node') as StoredWebhook;

				// An endpoint already registered for this exact URL (a previous activation whose secret is gone) would deliver
				// every event twice, and only the new one can be verified: remove it first.
				const listed = await apiRequest.call(this, 'GET', '/api/webhooks');
				for (const old of ((listed.webhooks as IDataObject[]) || []).filter((h) => h.url === url))
					await apiRequest.call(this, 'DELETE', `/api/webhooks/${encodeURIComponent(String(old.id))}`);

				const workflow = this.getWorkflow();
				const res = await apiRequest.call(this, 'POST', '/api/webhooks', {
					url,
					events,
					description: `n8n: ${workflow.name || `workflow ${workflow.id ?? ''}`}`.slice(0, 200),
				});
				const webhook = (res.webhook as IDataObject) || {};
				if (!webhook.id || !res.secret)
					throw new NodeApiError(this.getNode(), res as JsonObject, {
						message: 'PostWire did not return the webhook and its signing secret',
						description: 'Activate the workflow again. If it keeps happening, update the n8n-nodes-postwire package.',
					});
				data.webhookId = String(webhook.id);
				data.secret = String(res.secret);
				data.events = events;
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node') as StoredWebhook;
				if (data.webhookId) {
					try {
						await apiRequest.call(this, 'DELETE', `/api/webhooks/${encodeURIComponent(data.webhookId)}`);
					} catch (error) {
						// Already deleted in the dashboard: nothing left to remove. Anything else is reported and kept, so the next
						// deactivation tries again instead of leaving an endpoint that calls a dead URL.
						if ((error as NodeApiError).httpCode !== '404') {
							this.logger.warn(`PostWire Trigger: could not delete webhook ${data.webhookId}: ${(error as Error).message}`);
							return false;
						}
					}
				}
				delete data.webhookId;
				delete data.secret;
				delete data.events;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const req = this.getRequestObject();
		const headers = this.getHeaderData();
		const data = this.getWorkflowStaticData('node') as StoredWebhook;

		// The signature is over the exact bytes PostWire sent. n8n keeps them as rawBody; re-serialising the parsed JSON
		// gives the same bytes for PostWire's compact JSON, and is only the fallback.
		const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}), 'utf8');
		const signature = headers['postwire-signature'];
		const problem = signatureProblem(data.secret ?? '', raw, Array.isArray(signature) ? signature[0] : signature);
		if (problem) {
			this.getResponseObject().status(401).json({ error: `PostWire signature check failed: ${problem}` });
			return { noWebhookResponse: true };
		}

		const event = this.getBodyData();
		const type = String(event.type ?? headers['postwire-event'] ?? '');
		const events = this.getNodeParameter('events', []) as string[];
		// webhook.test is what "Send test" in PostWire sends: it always gets through, so the trigger can be tried.
		if (type !== 'webhook.test' && !events.includes(type)) return {};

		const options = this.getNodeParameter('options', {}) as IDataObject;
		const body = (event.data as IDataObject) || {};
		if (type !== 'webhook.test') {
			const networks = (options.networks as string[]) || [];
			if (networks.length && !networksOf(body).some((n) => networks.includes(n))) return {};
			const brandId = String(options.brandId ?? '').trim();
			const eventBrand = body.brand_id ?? (body.account as IDataObject | undefined)?.brand_id;
			if (brandId && eventBrand !== brandId) return {};
		}

		const delivery = headers['postwire-delivery'];
		return {
			workflowData: [
				this.helpers.returnJsonArray([
					{ ...event, delivery_id: Array.isArray(delivery) ? delivery[0] : (delivery ?? null) },
				]),
			],
		};
	}
}
