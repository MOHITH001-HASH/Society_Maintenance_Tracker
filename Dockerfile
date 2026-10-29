# Build the React client with Node tooling, then run only Python in production.
FROM node:22-alpine AS frontend-builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM python:3.12-slim AS runtime

WORKDIR /app
ENV PORT=8080
ENV APP_ENV=production
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/__init__.py ./backend/__init__.py
COPY backend/flask_gateway ./backend/flask_gateway
COPY --from=frontend-builder /app/dist ./dist

EXPOSE 8080
CMD ["sh", "-c", "gunicorn --bind :${PORT} --workers 2 --threads 4 --timeout 120 backend.flask_gateway.app:app"]
