FROM node:22-slim

WORKDIR /app

# Copy package files (paths relative to repo root build context)
COPY apps/bff/package.json ./

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy source files
COPY apps/bff/tsconfig.json ./
COPY apps/bff/src/ ./src/

# Build TypeScript
RUN npx tsc

# Expose port
EXPOSE 4000

# Start compiled server
CMD ["node", "dist/server.js"]
