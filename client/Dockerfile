# Stage 1: Build the React + Vite static client
FROM --platform=linux/amd64 node:20-alpine AS builder

WORKDIR /app

# Accept build arguments for API URL and Model version
ARG VITE_API_URL=http://localhost:8000
ARG VITE_MODEL_VERSION=v4_2

ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_MODEL_VERSION=${VITE_MODEL_VERSION}

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps

# Copy source code and static assets (including ONNX models in public/models)
COPY . .

# Build production bundle
RUN npm run build

# Stage 2: Serve static files with Nginx
FROM --platform=linux/amd64 nginx:alpine

# Copy custom nginx configuration listening on port 3000
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built artifacts from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose port 3000
EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
