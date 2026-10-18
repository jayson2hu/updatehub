FROM node:24-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ARG API_INTERNAL_URL=http://api:8000
ENV API_INTERNAL_URL=$API_INTERNAL_URL
COPY . .
RUN npm ci && npm run build --workspace apps/web

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
RUN addgroup -S -g 10001 updatehub && adduser -S -u 10001 -G updatehub updatehub
COPY --from=build --chown=updatehub:updatehub /app/apps/web/.next/standalone ./
COPY --from=build --chown=updatehub:updatehub /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=updatehub:updatehub /app/apps/web/public ./apps/web/public
USER updatehub
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
