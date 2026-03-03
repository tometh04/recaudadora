FROM node:22-slim

# Install poppler-utils for PDF to image conversion (pdftoppm)
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci --production=false

# Copy source code
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript
RUN npx tsc

# Create directories for runtime data
RUN mkdir -p auth_sessions media

# Railway sets PORT dynamically
ENV PORT=3001
EXPOSE $PORT

# Start server
CMD ["node", "dist/index.js"]
