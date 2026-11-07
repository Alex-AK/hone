import { join } from 'node:path';

import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';

/**
 * Serves the built web app from the API's own port, for a deployment with no
 * Vite dev server in front of it. Any GET outside `/api` that is not a file
 * gets `index.html`, so a reload on a client-side route still lands in the app.
 */
export function serveWebApp(app: NestExpressApplication, webDist: string): void {
  const indexHtml = join(webDist, 'index.html');

  app.useStaticAssets(webDist);
  app.use((request: Request, response: Response, next: NextFunction) => {
    const isClientRoute = request.method === 'GET' && !request.path.startsWith('/api');

    if (!isClientRoute) {
      next();
      return;
    }

    response.sendFile(indexHtml);
  });
}
