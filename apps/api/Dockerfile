FROM node:20-slim

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV PUPPETEER_EXECUTABLE_PATH="/usr/bin/chromium"

RUN corepack enable

WORKDIR /app

# Install necessary packages including Chromium
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y chromium chromium-sandbox && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives

# Copy the entire project
COPY . .

# Navigate to the api directory
WORKDIR /app/apps/api

# Install dependencies
RUN pnpm install --frozen-lockfile

# Build the application
RUN pnpm run build

EXPOSE 8080

# Start the server
CMD ["node", "dist/index.js"]
