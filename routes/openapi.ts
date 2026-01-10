/**
 * OpenAPI Routes
 *
 * Serves a generated OpenAPI spec from the in-memory RouteRegistry.
 */

import { OpenApiGenerator } from '@/openapi/OpenApiGenerator';
import { Env } from '@config/env';
import { type IRouter, Router } from '@routing/Router';
import { RouteRegistry } from '@routing/RouteRegistry';

const getServerUrl = (): string | undefined => {
  const explicit = Env.BASE_URL;
  if (explicit.trim() !== '') return explicit;

  const host = Env.HOST;
  const port = Env.PORT;
  if (host.trim() === '' || Number.isNaN(port) || port <= 0) return undefined;

  return `http://${host}:${port}`;
};

const getDocsHtml = (specUrl: string): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${Env.APP_NAME} API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
    <style>
      html, body { margin: 0; padding: 0; }
      #swagger-ui { box-sizing: border-box; }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
    <script>
      window.onload = function () {
        window.ui = SwaggerUIBundle({
          url: ${JSON.stringify(specUrl)},
          dom_id: '#swagger-ui',
          presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
          layout: 'BaseLayout'
        });
      };
    </script>
  </body>
</html>`;

export function registerOpenApiRoutes(router: IRouter): void {
  Router.get(
    router,
    '/openapi.json',
    async (_req, res) => {
      const doc = OpenApiGenerator.generate(RouteRegistry.list(), {
        title: Env.APP_NAME,
        version: Env.get('APP_VERSION', '0.0.0'),
        serverUrl: getServerUrl(),
        excludePaths: ['/openapi.json', '/docs'],
      });

      res.json(doc);
    },
    {
      meta: {
        summary: 'OpenAPI spec',
        tags: ['Docs'],
        responseStatus: 200,
      },
    }
  );

  Router.get(
    router,
    '/docs',
    async (_req, res) => {
      res.html(getDocsHtml('/openapi.json'));
    },
    {
      meta: {
        summary: 'Swagger UI',
        tags: ['Docs'],
        responseStatus: 200,
      },
    }
  );
}

export default registerOpenApiRoutes;
