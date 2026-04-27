
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

RUN npm run build

EXPOSE 8000

ENV MCP_MODE=hosted
ENV MCP_HOST=0.0.0.0
ENV MCP_PORT=8000

CMD ["node", "dist/server.js"]
