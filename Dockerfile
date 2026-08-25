FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install dependencies first for better caching
COPY package.json package-lock.json ./
RUN npm ci

# Copy the rest of the application code
COPY . .

# Build the frontend (Vite React app)
RUN npm run build

# Expose the server port
EXPOSE 3000

# Start the application
CMD ["npm", "run", "start"]
