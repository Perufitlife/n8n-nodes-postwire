// A fake n8n execution context for the node tests (no network): every HTTP call is recorded and answered by a
// script, so each test states exactly what PostWire would have been sent. Run against dist/ (`npm run build` first).
function ctx({ version = 2, params = {}, items = [{ json: {} }], answer, binary, executionId = 'exec-1', continueOnFail = false }) {
	const calls = [];
	const node = { name: 'PostWire', typeVersion: version, type: 'n8n-nodes-postwire.postWire', parameters: params };
	const reply = (opts, authed) => {
		calls.push({ ...opts, authed });
		return answer(opts, calls.length) ?? { statusCode: 200, body: {} };
	};
	return {
		calls,
		getInputData: () => items,
		getNode: () => node,
		getNodeParameter: (name, i, fallback) => (name in params ? params[name] : fallback),
		getTimezone: () => 'America/Lima',
		getExecutionId: () => executionId,
		continueOnFail: () => continueOnFail,
		helpers: {
			httpRequestWithAuthentication: async (cred, opts) => reply(opts, cred),
			httpRequest: async (opts) => reply(opts, null),
			assertBinaryData: () => binary.meta,
			getBinaryDataBuffer: async () => binary.buffer,
		},
	};
}
const ok = (body) => ({ statusCode: 200, body });

module.exports = { ctx, ok };
