FROM node:16-alpine

WORKDIR /app

# Copy package files first (to leverage Docker layer caching)
COPY package.json package-lock.json* ./

# Install all dependencies including development ones for nodemon
RUN npm install

# Now copy application code
COPY . .

# Environment variables will be overridden by docker-compose
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Default command - will be overridden by docker-compose
CMD ["node", "index.js"]