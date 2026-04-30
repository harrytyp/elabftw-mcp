
# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
# Install all dependencies including devDependencies
RUN npm install

COPY . .
# Use npx to ensure tsup is found in node_modules/.bin
RUN npx tsup

# Production stage
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 8000

ENV MCP_MODE=hosted
ENV MCP_HOST=0.0.0.0
ENV MCP_PORT=8000

CMD ["node", "dist/server.js"]
