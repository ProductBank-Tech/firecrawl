FROM node:20-slim

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV PUPPETEER_EXECUTABLE_PATH="/usr/bin/chromium"
ENV PORT=8080

RUN corepack enable

WORKDIR /app

# Install necessary packages including Chromium
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y chromium chromium-sandbox && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives

# Copy the entire project
COPY . .

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build the application
RUN pnpm run build

# List the contents of the dist directory (for debugging)
RUN ls -la dist/src

EXPOSE 8080

# Start the server
CMD ["pnpm", "run", "start:production"]