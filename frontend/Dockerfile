# ── Stage 1: Build the React frontend ─────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy the root .env file so Vite can read VITE_* vars at build time.
# .dockerignore blocks the real .env (which has secrets), so we try
# .env first and fall back to .env.example (which has defaults).
# docker-compose passes the real VITE_* vars as build args.
COPY .env* ./
RUN if [ ! -f .env ]; then cp .env.example .env; fi

# Copy package files first for layer caching
COPY frontend/package.json frontend/package-lock.json ./frontend/
WORKDIR /app/frontend
RUN npm install --legacy-peer-deps

# Copy frontend source code
WORKDIR /app
COPY frontend/ ./frontend/

# Declare build arguments for all Vite environment variables
ARG VITE_API_URL
ARG VITE_MAPBOX_TOKEN
ARG VITE_TRAINING_AI_PROVIDER
ARG VITE_GOOGLE_API_KEY
ARG VITE_TRAINING_GOOGLE_MODEL
ARG VITE_OPENAI_API_KEY
ARG VITE_OPENAI_BASE_URL
ARG VITE_TRAINING_OPENAI_MODEL
ARG VITE_GOOGLE_TRANSLATE_API_KEY
ARG VITE_ELEVENLABS_API_KEY
ARG VITE_ELEVENLABS_API_URL
ARG VITE_TWILIO_ACCOUNT_SID
ARG VITE_TWILIO_AUTH_TOKEN
ARG VITE_TWILIO_PHONE_NUMBER

# Export build arguments as environment variables so Vite can read them at build time
ENV VITE_API_URL=$VITE_API_URL \
    VITE_MAPBOX_TOKEN=$VITE_MAPBOX_TOKEN \
    VITE_TRAINING_AI_PROVIDER=$VITE_TRAINING_AI_PROVIDER \
    VITE_GOOGLE_API_KEY=$VITE_GOOGLE_API_KEY \
    VITE_TRAINING_GOOGLE_MODEL=$VITE_TRAINING_GOOGLE_MODEL \
    VITE_OPENAI_API_KEY=$VITE_OPENAI_API_KEY \
    VITE_OPENAI_BASE_URL=$VITE_OPENAI_BASE_URL \
    VITE_TRAINING_OPENAI_MODEL=$VITE_TRAINING_OPENAI_MODEL \
    VITE_GOOGLE_TRANSLATE_API_KEY=$VITE_GOOGLE_TRANSLATE_API_KEY \
    VITE_ELEVENLABS_API_KEY=$VITE_ELEVENLABS_API_KEY \
    VITE_ELEVENLABS_API_URL=$VITE_ELEVENLABS_API_URL \
    VITE_TWILIO_ACCOUNT_SID=$VITE_TWILIO_ACCOUNT_SID \
    VITE_TWILIO_AUTH_TOKEN=$VITE_TWILIO_AUTH_TOKEN \
    VITE_TWILIO_PHONE_NUMBER=$VITE_TWILIO_PHONE_NUMBER

# Build — Vite reads envDir: "../" which resolves to /app (where .env lives)
WORKDIR /app/frontend
RUN npm run build

# ── Stage 2: Serve with nginx ───────────────────────────────────────────────
FROM nginx:alpine

COPY --from=builder /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
