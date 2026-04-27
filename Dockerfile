FROM node:20-slim

RUN apt-get update && apt-get install -y \
    git \
    python3 \
    make \
    g++ \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/* \
    && git config --global url."https://github.com/".insteadOf "ssh://git@github.com/"

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

EXPOSE 8080

CMD ["node", "server.js"]
