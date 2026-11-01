import { McpServer } from '@modelcontextprotocol/server';
import { createMcpHandler } from 'agents/mcp/server';
import { z } from 'zod';

// Raw Markdown from the repo's docs/ folder: clean text for agents, no HTML scraping.
const DOCS_BASE = 'https://raw.githubusercontent.com/ZinTrust/zintrust/master/docs';
const MAX_DOC_CHARS = 50_000;
const FETCH_TIMEOUT_MS = 10_000;

// Flat slugs match the docs site navigation (docs-website/config.ts).
const DOC_PAGES: readonly string[] = [
	'getting-started',
	'installation',
	'query-builder',
	'models',
	'routing',
	'microservices',
	'cli-reference',
];

const CLI = {
	'new project': 'npm install -g @zintrust/core && zin new my-app',
	'start dev server': 'zin start   # http://localhost:7777',
	'add sqlite': 'zin add db:sqlite',
	'add postgres': 'zin add db:postgres',
	'add mysql': 'zin add db:mysql',
	'add sql server': 'zin add db:mssql',
	'run on cloudflare workers': 'zin start --wg',
	'cloudflare containers proxy': 'zin init:containers-proxy && zin docker -e staging',
	'run on aws lambda': 'zin start --lambda',
	'run on deno': 'zin start --deno',
	debug: 'zin debug',
} as const;

type CliTask = keyof typeof CLI;
const CLI_TASKS = Object.keys(CLI) as [CliTask, ...CliTask[]];

function errorResult(text: string): { isError: true; content: { type: 'text'; text: string }[] } {
	return { isError: true, content: [{ type: 'text' as const, text }] };
}

function buildServer(): McpServer {
	const server = new McpServer({ name: 'zintrust-docs', version: '1.0.0' });

	server.registerTool(
		'list_doc_pages',
		{
			description: 'List the ZinTrust documentation pages that can be fetched with get_doc_page.',
			inputSchema: z.object({}),
		},
		async () => ({
			content: [{ type: 'text', text: DOC_PAGES.join('\n') }],
		})
	);

	server.registerTool(
		'get_doc_page',
		{
			description:
				'Fetch a ZinTrust framework documentation page (TypeScript backend framework: models, ORM, routing, microservices, CLI).',
			inputSchema: z.object({
				slug: z.string().describe("Doc slug from list_doc_pages, e.g. 'routing'"),
			}),
		},
		async ({ slug }) => {
			if (!DOC_PAGES.includes(slug)) {
				return errorResult(`Unknown page. Use one of:\n${DOC_PAGES.join('\n')}`);
			}

			try {
				const res = await fetch(`${DOCS_BASE}/${slug}.md`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
				if (!res.ok) {
					return errorResult(`Could not fetch ${slug}: HTTP ${res.status}`);
				}

				const text = await res.text();
				const truncated = text.length > MAX_DOC_CHARS;
				return {
					content: [
						{
							type: 'text' as const,
							text: truncated ? `${text.slice(0, MAX_DOC_CHARS)}\n\n[truncated at ${MAX_DOC_CHARS} characters]` : text,
						},
					],
				};
			} catch (error) {
				const reason = error instanceof Error ? error.message : String(error);
				return errorResult(`Could not fetch ${slug}: ${reason}`);
			}
		}
	);

	server.registerTool(
		'cli_command',
		{
			description: 'Get the ZinTrust `zin` CLI command for a common task.',
			inputSchema: z.object({
				task: z.enum(CLI_TASKS).describe('The task to get the zin command for, e.g. "add postgres"'),
			}),
		},
		async ({ task }) => ({
			content: [{ type: 'text', text: CLI[task] }],
		})
	);

	return server;
}

const handleMcp = createMcpHandler(() => buildServer(), { route: '/mcp' });

export default {
	fetch(request: Request, env: unknown, ctx: ExecutionContext): Promise<Response> | Response {
		const url = new URL(request.url);
		if (url.pathname === '/health') return new Response('ok');
		return handleMcp(request, env, ctx);
	},
};
