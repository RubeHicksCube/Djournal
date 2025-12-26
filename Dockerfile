FROM node:18-alpine AS builder

WORKDIR /app

# Install all dependencies for building
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build the React client
RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Install only production dependencies
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy built client from builder stage
COPY --from=builder /app/client/dist ./client/dist

# Copy server code
COPY server/ ./server/
COPY package*.json ./

# Create data directory for SQLite database
RUN mkdir -p /app/data && mkdir -p /app/journal

# Set permissions for data directories
RUN chown -R node:node /app/data /app/journal

# Expose port
EXPOSE 8000

# Use environment variables
ENV NODE_ENV=production
ENV ADMIN_PASSWORD=admin123
ENV JWT_SECRET=change-this-secret-key-in-production

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8000/api || exit 1

# Start the application
USER node
CMD ["npm", "start"]