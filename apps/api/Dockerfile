FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY dist/ ./dist/
COPY drizzle/ ./drizzle/
COPY migrate.mjs ./migrate.mjs
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
ENTRYPOINT ["/app/entrypoint.sh"]
