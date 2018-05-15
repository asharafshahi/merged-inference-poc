FROM node:8.11
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["node", "testRun.js"]
