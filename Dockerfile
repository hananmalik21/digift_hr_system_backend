# Digify ERP — Node 20 + Oracle Instant Client + Puppeteer (job offer PDFs)
FROM node:20-slim

ENV NODE_ENV=production
ENV PUPPETEER_CACHE_DIR=/app/.cache/puppeteer

# Oracle Instant Client + headless Chrome runtime libraries
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    unzip \
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

# Install deps first (layer cache); postinstall downloads Puppeteer Chrome
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# App source (Wallet/, TESTDB/, public/face-models/, etc.)
COPY . .

EXPOSE 3000

CMD ["node", "index.js"]
