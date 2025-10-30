FROM --platform=linux/amd64 node:20-alpine AS build
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

FROM --platform=linux/amd64 node:20-alpine AS runtime
WORKDIR /app

# Copy only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Bring in build artifacts
COPY --from=build /app/dist ./dist
COPY --from=build /app/src ./src
COPY --from=build /app/package*.json ./

# Expose server port
EXPOSE 8080

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
