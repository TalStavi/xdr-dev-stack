FROM node:16-alpine

WORKDIR /app

# Copy package files first (to leverage Docker layer caching)
COPY package.json package-lock.json* ./

# Clean install dependencies without using local cache
RUN npm ci --only=production

# Now copy application code
COPY . .

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "index.js"]