# Stage 1: Builder (Installs dependencies)
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package.json and install dependencies
COPY package*.json ./
RUN npm install --omit=dev --legacy-peer-deps && npm cache clean --force

# Copy the rest of the app
COPY . .

# Stage 2: Final Production Image
FROM node:20-alpine

WORKDIR /app

# Copy only the necessary files from builder stage
COPY --from=builder /app /app

# Expose app port
EXPOSE 3450

# Run the app
CMD ["node", "index.js"]

