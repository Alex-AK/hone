# One stage, with the whole workspace and its dev dependencies, because the
# running app needs them: workouts run vitest from packages/workouts/node_modules,
# ts-type reps load the TypeScript compiler, and the server finds its content by
# walking up from apps/server.
FROM node:24-bookworm-slim

# NODE_ENV stays unset: workout suites inherit the server's environment, and a
# production React build has no act(), which every component checkpoint uses.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    HUSKY=0 \
    PORT=3001 \
    HONE_DATA_DIR=/data \
    WEB_DIST=/app/apps/web/dist

RUN corepack enable \
 && mkdir -p /app /data \
 && chown node:node /app /data

USER node
WORKDIR /app

COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY --chown=node:node apps/server/package.json apps/server/
COPY --chown=node:node apps/web/package.json apps/web/
COPY --chown=node:node packages/shared/package.json packages/shared/
COPY --chown=node:node packages/workouts/package.json packages/workouts/
COPY --chown=node:node packages/handbook/package.json packages/handbook/
COPY --chown=node:node packages/modules/package.json packages/modules/
COPY --chown=node:node packages/paths/package.json packages/paths/
COPY --chown=node:node packages/decks/package.json packages/decks/
RUN pnpm install --frozen-lockfile

COPY --chown=node:node . .
RUN pnpm build

WORKDIR /app/apps/server
EXPOSE 3001
# Boot seeds only an empty database, so new content from a deploy is upserted
# here first. It keys on slug and leaves attempts and progress alone.
CMD ["sh", "-c", "node dist/seed/seed-cli.js && exec node dist/main.js"]
