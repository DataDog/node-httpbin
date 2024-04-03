FROM node:lts-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm i --production

FROM node:lts-alpine
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY . /app

EXPOSE 8080

CMD npm start
