# ===================================================
# Production Dockerfile for Google Cloud Run
# Multi-stage build for React + TypeScript + Express Backend
# ===================================================

# Stage 1: Build Phase
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
COPY package*.json ./
RUN npm ci

# Copy all source files
COPY . .

# Build Vite client SPA and bundle backend server to dist/server.cjs
RUN npm run build

# Stage 2: Production Runtime
FROM node:20-alpine AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=8080

# Install production dependencies only
COPY package*.json ./
RUN npm ci --only=production

# Copy compiled build artifacts from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/index.html ./index.html

# Create required persistent directories
RUN mkdir -p .data uploads

# Expose default Cloud Run port
EXPOSE 8080

# Start production server
CMD ["node", "dist/server.cjs"]
