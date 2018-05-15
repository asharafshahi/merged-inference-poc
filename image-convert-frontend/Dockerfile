FROM node:8.11
RUN apt-get update && apt-get install -y software-properties-common vim
RUN apt-get update && apt-get install -y git
RUN apt-get update && apt-get install -y libvtkgdcm-tools
RUN apt-get update && apt-get install -y libgdcm-tools

WORKDIR /app
COPY package.json /app
RUN npm install
COPY . /app
CMD ["node", "index.js"]
EXPOSE 3000
