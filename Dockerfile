FROM node:lts-alpine AS builder

WORKDIR /app

RUN apk add openssl &&  \
    openssl genrsa -out server.key 2048 &&  \
    openssl ecparam -genkey -name secp384r1 -out server.key &&  \
    openssl req -new -x509 -sha256 -key server.key -out server.crt -days 3650 -subj "/C=US/ST=Denial/L=Springfield/O=Dis/CN=www.example.com"

COPY package*.json ./
RUN npm i --production

FROM node:lts-alpine
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/server.key /app/server.crt /certs/

COPY . /app

ENV HTTPS_CERT_FILE='/certs/server.crt'
ENV HTTPS_KEY_FILE='/certs/server.key'

CMD npm start
