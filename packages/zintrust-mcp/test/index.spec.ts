import { SELF } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';

const MCP_HEADERS = {
	'content-type': 'application/json',
	accept: 'application/json, text/event-stream',
};

type JsonRpcResponse = {
	result?: {
		tools?: Array<{ name: string }>;
		content?: Array<{ type: string; text: string }>;
		isError?: boolean;
	};
	error?: { code: number; message: string };
};

const parseResponse = async (res: Response): Promise<JsonRpcResponse> => {
	const body = await res.text();
	const dataLine = body
		.split('\n')
		.find((line) => line.startsWith('data: '));
	return JSON.parse(dataLine ? dataLine.slice('data: '.length) : body) as JsonRpcResponse;
};

const callMcp = async (method: string, params: Record<string, unknown> = {}): Promise<JsonRpcResponse> => {
	const res = await SELF.fetch('https://mcp.zintrust.com/mcp', {
		method: 'POST',
		headers: MCP_HEADERS,
		body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
	});
	return parseResponse(res);
};

const callTool = (name: string, args: Record<string, unknown>): Promise<JsonRpcResponse> =>
	callMcp('tools/call', { name, arguments: args });

describe('zintrust-mcp worker', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('responds to the health check', async () => {
		const res = await SELF.fetch('https://mcp.zintrust.com/health');
		expect(res.status).toBe(200);
		expect(await res.text()).toBe('ok');
	});

	it('describes the service at the root path', async () => {
		const res = await SELF.fetch('https://mcp.zintrust.com/');
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ name: 'zintrust-mcp', mcp: '/mcp', health: '/health' });
	});

	it('describes the MCP endpoint to a plain GET', async () => {
		const res = await SELF.fetch('https://mcp.zintrust.com/mcp', { headers: { accept: 'text/html' } });
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ name: 'zintrust-mcp', endpoint: '/mcp', method: 'POST', health: '/health' });
	});

	it('answers an SSE GET on /mcp with 405 since no server stream is offered', async () => {
		const res = await SELF.fetch('https://mcp.zintrust.com/mcp', { headers: { accept: 'text/event-stream' } });
		expect(res.status).toBe(405);
	});

	it('lists the three documented tools', async () => {
		const response = await callMcp('tools/list');
		const names = response.result?.tools?.map((tool) => tool.name).sort();
		expect(names).toEqual(['cli_command', 'get_doc_page', 'list_doc_pages']);
	});

	it('lists the doc pages', async () => {
		const response = await callTool('list_doc_pages', {});
		const text = response.result?.content?.[0]?.text ?? '';
		expect(text.split('\n')).toContain('routing');
		expect(text.split('\n')).toContain('cli-reference');
	});

	it('returns the zin command for a task', async () => {
		const response = await callTool('cli_command', { task: 'add postgres' });
		expect(response.result?.content?.[0]?.text).toBe('zin add db:postgres');
	});

	it('rejects an unknown CLI task at schema validation', async () => {
		const response = await callTool('cli_command', { task: 'delete everything' });
		expect(response.result?.isError).toBe(true);
	});

	it('rejects a slug outside the allowlist without fetching', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch');
		const response = await callTool('get_doc_page', { slug: '../etc/passwd' });
		expect(response.result?.isError).toBe(true);
		expect(response.result?.content?.[0]?.text).toContain('Unknown page');
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('returns an error when the docs site responds with a failure', async () => {
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 503 }));
		const response = await callTool('get_doc_page', { slug: 'routing' });
		expect(response.result?.isError).toBe(true);
	});

	it('fetches the Markdown source for a doc page', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('# Routing', { status: 200 }));
		const response = await callTool('get_doc_page', { slug: 'routing' });
		expect(response.result?.content?.[0]?.text).toBe('# Routing');
		expect(String(fetchSpy.mock.calls[0]?.[0])).toBe(
			'https://raw.githubusercontent.com/ZinTrust/zintrust/master/docs/routing.md'
		);
	});

	it('truncates long doc pages', async () => {
		const big = 'a'.repeat(60_000);
		vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(big, { status: 200 }));
		const response = await callTool('get_doc_page', { slug: 'routing' });
		const text = response.result?.content?.[0]?.text ?? '';
		expect(response.result?.isError).toBeFalsy();
		expect(text.length).toBeLessThan(60_000);
		expect(text).toContain('truncated');
	});
});
