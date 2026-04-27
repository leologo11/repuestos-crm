FROM node:20-bullseye

RUN apt-get update && apt-get install -y \
    git \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/* \
    && git config --global url."https://github.com/".insteadOf "ssh://git@github.com/" \
    && git config --global url."https://github.com/".insteadOf "git+ssh://git@github.com/"

WORKDIR /app

ENV npm_config_python=python3

COPY package.json ./
RUN npm install --legacy-peer-deps

COPY . .
RUN npm run build

EXPOSE 8080

CMD ["node", "server.js"]
