FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
LABEL fly_launch_runtime="Node.js"

# Explicitly install pnpm
RUN npm install -g pnpm

COPY . /app
WORKDIR /app

FROM base AS prod-deps
# Install dependencies with error logging
RUN pnpm install --prod --frozen-lockfile || (echo "pnpm install failed" && cat /root/.pnpm-debug.log && exit 1)

FROM base AS build
COPY --from=prod-deps /app/node_modules /app/node_modules
RUN pnpm install --frozen-lockfile || (echo "pnpm install failed" && cat /root/.pnpm-debug.log && exit 1)
RUN pnpm run build

FROM base
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y chromium chromium-sandbox && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives
COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=build /app /app

EXPOSE 8080
ENV PUPPETEER_EXECUTABLE_PATH="/usr/bin/chromium"

# Add a CMD instruction to specify how to run your application
CMD ["pnpm", "start"]