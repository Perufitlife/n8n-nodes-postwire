"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostWireApi = void 0;

// PostWire authenticates with a single bearer key. The `test` block below is what makes n8n's
// "Test connection" button meaningful: /api/me returns the plan, the month's usage and the
// connected accounts, so a wrong key fails immediately instead of at publish time.
class PostWireApi {
  constructor() {
    this.name = 'postWireApi';
    this.displayName = 'PostWire API';
    this.documentationUrl = 'https://postwire.io/n8n-social-media-automation/';
    this.properties = [
      {
        displayName: 'API Key',
        name: 'apiKey',
        type: 'string',
        typeOptions: { password: true },
        default: '',
        required: true,
        placeholder: 'pw_live_...',
        description:
          'Your PostWire API key. Get one free at https://postwire.io/dashboard.html — the free plan covers one brand, every network it connects, and 30 posts a month, with no card.',
      },
    ];
    this.authenticate = {
      type: 'generic',
      properties: {
        headers: {
          Authorization: '=Bearer {{$credentials.apiKey}}',
          'X-PostWire-Source': 'n8n',
        },
      },
    };
    this.test = {
      request: {
        baseURL: 'https://postwire.io',
        url: '/api/me',
        method: 'GET',
      },
    };
  }
}
exports.PostWireApi = PostWireApi;
