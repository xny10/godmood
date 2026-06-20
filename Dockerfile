# ==========================================
# TTGODMODE — Dockerfile for Railway
# ==========================================

FROM node:18-slim

# Install FFmpeg for metadata randomizer
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application files
COPY . .

# Create directories for downloads
RUN mkdir -p downloads

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "server.js"]
