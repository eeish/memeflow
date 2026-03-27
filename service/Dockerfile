# ── Build stage ──────────────────────────────────────────────────────────────
FROM rust:1.88-slim AS builder

WORKDIR /app

RUN apt-get update && \
    apt-get install -y pkg-config libssl-dev && \
    rm -rf /var/lib/apt/lists/*

# Copy manifests first so dependency layers are cached independently of src changes.
# Railway builds from the repo root, so paths are relative to there.
COPY service/Cargo.toml service/Cargo.lock ./

# Migrations are embedded at compile time by sqlx::migrate!()
COPY service/migrations ./migrations

# Copy source last (changes most often)
COPY service/src ./src

RUN cargo build --release

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM debian:bookworm-slim

RUN apt-get update && \
    apt-get install -y ca-certificates curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/target/release/cord-service .

EXPOSE 3001

ENV HOST=0.0.0.0
ENV PORT=3001
ENV RUST_LOG=info

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

CMD ["./cord-service"]
