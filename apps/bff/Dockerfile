FROM node:22-slim

WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy source
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript
RUN npx tsc || true

# Expose port
EXPOSE 4000

# Start — prefer compiled JS, fall back to tsx
CMD ["node", "dist/server.js"]
