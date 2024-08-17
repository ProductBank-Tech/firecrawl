FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
LABEL fly_launch_runtime="Node.js"

# Explicitly install pnpm
RUN npm install -g pnpm

# Debug: List contents of the root directory
RUN echo "Contents of root directory:" && ls -la /

# Debug: List contents of the current directory
RUN echo "Contents of current directory:" && ls -la

# Try to copy package.json and pnpm-lock.yaml (if it exists)
COPY package.json pnpm-lock.yaml* ./

# Debug: List contents after copy
RUN echo "Contents after copy:" && ls -la

WORKDIR /app

# Debug: List contents of /app directory
RUN echo "Contents of /app directory:" && ls -la /app

# Install dependencies
RUN pnpm install --prod --frozen-lockfile || (echo "pnpm install failed" && exit 1)

# Now copy the rest of the application
COPY . .

# Debug: Final list of contents
RUN echo "Final contents:" && ls -la

# Build stage
FROM base AS build
RUN pnpm install --frozen-lockfile || (echo "pnpm install failed" && exit 1)
RUN pnpm run build

# Production stage
FROM base
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y chromium chromium-sandbox && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives

# Copy built files and production dependencies
COPY --from=build /app/dist /app/dist
COPY --from=build /app/node_modules /app/node_modules

EXPOSE 8080
ENV PUPPETEER_EXECUTABLE_PATH="/usr/bin/chromium"

# Add a CMD instruction to specify how to run your application
CMD ["pnpm", "start"]