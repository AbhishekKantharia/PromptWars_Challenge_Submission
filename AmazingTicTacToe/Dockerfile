# ─────────────────────────────────────────────────────────────────────────────
# Quantum Tic-Tac-Toe — Dockerfile
# ─────────────────────────────────────────────────────────────────────────────
# Two-stage build:
#   Stage 1 (builder) – installs Python dependencies into a clean venv
#   Stage 2 (runtime) – copies only the venv + app code; runs as non-root user
#
# Security hardening applied:
#   • Non-root user (uid 1001)
#   • Minimal base image (python:3.11-slim)
#   • No unnecessary packages
#   • Read-only filesystem (enforced at run time via --read-only flag recommended)
#   • HEALTHCHECK endpoint for Cloud Run
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: dependency installer ────────────────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /build

# Copy only requirements first (better layer caching)
COPY requirements.txt .

RUN pip install --upgrade pip --quiet \
    && pip install --prefix=/install --no-cache-dir -r requirements.txt


# ── Stage 2: lean runtime image ──────────────────────────────────────────────
FROM python:3.11-slim AS runtime

# Metadata labels (OCI standard)
LABEL org.opencontainers.image.title="Quantum Tic-Tac-Toe" \
      org.opencontainers.image.description="Chaos-driven Tic-Tac-Toe with secure terminal — deployed on Google Cloud Run" \
      org.opencontainers.image.source="https://github.com/your-repo/quantum-tictactoe" \
      org.opencontainers.image.version="2.0.0"

# Install only the OS packages we truly need (none for this app)
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages from builder stage
COPY --from=builder /install /usr/local

# Create a non-root user
RUN addgroup --system appgroup && adduser --system --ingroup appgroup --uid 1001 appuser

WORKDIR /app

# Copy application source (owned by appuser)
COPY --chown=appuser:appgroup . .

# Switch to non-root user
USER appuser

# Cloud Run injects PORT; default to 8080 for local Docker runs
ENV PORT=8080
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

EXPOSE 8080

# Health check — Cloud Run uses HTTP GET on the root path
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT}/ || exit 1

CMD ["python", "app.py"]
