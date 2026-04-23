# ==========================================
# Build stage: install dependencies
# ==========================================
FROM python:3.11-slim AS builder

WORKDIR /build

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ==========================================
# Runtime stage — everything bundled in one image
# ==========================================
FROM python:3.11-slim

WORKDIR /app

# Copy installed packages from builder
COPY --from=builder /install /usr/local

# Copy backend source
COPY app.py .
COPY links.csv .

# Copy pre-built data files
COPY cache/ cache/

# Copy frontend static files
COPY cinematch-frontend/ cinematch-frontend/

EXPOSE 8001

# Railway injects $PORT at runtime; fall back to 8001 locally
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8001}"]
