# syntax=docker/dockerfile:1

# Digify ERP — Node 20 + Oracle Instant Client + Puppeteer (job offer PDFs)
FROM node:20-slim

ENV NODE_ENV=production
ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer

# Oracle Instant Client + Git/SSH + headless Chrome runtime libraries
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    unzip \
    git \
    openssh-client \
    libaio1 \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libxshmfence1 \
    libxss1 \
    libxtst6 \
  && rm -rf /var/lib/apt/lists/*

# GitHub host key for Git-over-SSH package dependencies.
# No private SSH key is copied into the image.
RUN mkdir -p -m 0700 /root/.ssh \
  && ssh-keyscan github.com >> /root/.ssh/known_hosts \
  && chmod 600 /root/.ssh/known_hosts

# Oracle Instant Client (required for oracledb thick mode)
RUN mkdir -p /opt/oracle \
  && cd /opt/oracle \
  && curl -L "https://www.dropbox.com/scl/fi/1g8ceina1v10vedn05z3f/instantclient-basic-linux.x64-23.26.0.0.0.zip?rlkey=0ldp74bn3krfpqgzepsg8m4u1&st=j5vf6ins&dl=1" -o instantclient.zip \
  && unzip instantclient.zip \
  && rm instantclient.zip \
  && echo "/opt/oracle/instantclient_23_26" > /etc/ld.so.conf.d/oracle-instantclient.conf \
  && ldconfig

ENV LD_LIBRARY_PATH=/opt/oracle/instantclient_23_26
ENV ORACLE_CLIENT_LIB_DIR=/opt/oracle/instantclient_23_26

WORKDIR /app

# Install dependencies first for Docker layer caching.
#
# SSH agent is forwarded only during this RUN instruction so npm can fetch:
#   - digify-hr-grc-backend
#   - @digifyhr/common
#
# The SSH private key is NOT stored in the Docker image.
COPY package.json package-lock.json ./

RUN --mount=type=ssh \
  npm ci --omit=dev \
  && npx puppeteer browsers install chrome \
  && node --input-type=module -e "import puppeteer from 'puppeteer'; import fs from 'fs'; const p = puppeteer.executablePath(); if (!fs.existsSync(p)) throw new Error('Chrome missing at ' + p); console.log('[build] Chrome OK:', p);"

# Application source.
# Oracle wallet is mounted read-only at runtime from compose.yml.
# It must NOT be copied into the image.
COPY . .

EXPOSE 3000

CMD ["node", "index.js"]
