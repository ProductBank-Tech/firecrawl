# FROM node:20-slim AS base
# ENV PNPM_HOME="/pnpm"
# ENV PATH="$PNPM_HOME:$PATH"
# LABEL fly_launch_runtime="Node.js"

# # Explicitly install pnpm
# RUN npm install -g pnpm

# WORKDIR /app

# # Copy package.json and pnpm-lock.yaml from the api directory
# COPY apps/api/package.json apps/api/pnpm-lock.yaml* ./

# # Install dependencies
# RUN pnpm install --prod --frozen-lockfile || (echo "pnpm install failed" && exit 1)

# # Now copy the rest of the api application
# COPY apps/api .

# # Build stage
# FROM base AS build
# RUN pnpm install --frozen-lockfile || (echo "pnpm install failed" && exit 1)
# RUN pnpm run build

# # Production stage
# FROM base
# RUN apt-get update -qq && \
#     apt-get install --no-install-recommends -y chromium chromium-sandbox && \
#     rm -rf /var/lib/apt/lists /var/cache/apt/archives

# # Copy built files and production dependencies
# COPY --from=build /app/dist /app/dist
# COPY --from=build /app/node_modules /app/node_modules

# EXPOSE 8080
# ENV PUPPETEER_EXECUTABLE_PATH="/usr/bin/chromium"

# # Correct CMD instruction
# CMD ["/bin/sh", "-c", "sleep 3 && pnpm start"]

FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
LABEL fly_launch_runtime="Node.js"
RUN corepack enable
COPY . /app
WORKDIR /app

FROM base AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

RUN pnpm install
RUN pnpm run build

# Install packages needed for deployment


FROM base
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y chromium chromium-sandbox && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives
COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=build /app /app




# Start the server by default, this can be overwritten at runtime
EXPOSE 8080
ENV PUPPETEER_EXECUTABLE_PATH="/usr/bin/chromium"