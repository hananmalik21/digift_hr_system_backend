# ---------- Base image ----------
FROM node:20-slim

ENV NODE_ENV=production

# ---------- System dependencies ----------
# curl  : to download the Oracle client
# unzip : to extract the zip
# libaio1 : required by Oracle Instant Client
RUN apt-get update \
  && apt-get install -y curl unzip libaio1 \
  && rm -rf /var/lib/apt/lists/*

# ---------- Oracle Instant Client from Dropbox ----------
RUN mkdir -p /opt/oracle \
  && cd /opt/oracle \
  && curl -L "https://www.dropbox.com/scl/fi/1g8ceina1v10vedn05z3f/instantclient-basic-linux.x64-23.26.0.0.0.zip?rlkey=0ldp74bn3krfpqgzepsg8m4u1&st=j5vf6ins&dl=1" -o instantclient.zip \
  && unzip instantclient.zip \
  && rm instantclient.zip \
  && ls -R /opt/oracle \
  && echo "/opt/oracle/instantclient_23_26" > /etc/ld.so.conf.d/oracle-instantclient.conf \
  && ldconfig

# ✅ Folder is instantclient_23_26 (as shown in your logs)
ENV LD_LIBRARY_PATH=/opt/oracle/instantclient_23_26
ENV ORACLE_CLIENT_LIB_DIR=/opt/oracle/instantclient_23_26

# ---------- App setup ----------
WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm install --omit=dev

# Copy the rest of the app (includes TESTDB wallet folder)
COPY . .

# Port your Node app listens on
EXPOSE 3000

# Start command (adjust if your entry file is different)
CMD ["node", "api-server.js"]
