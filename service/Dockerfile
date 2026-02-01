# Cord Service Dockerfile

# Build stage
FROM rust:1.75 as builder

WORKDIR /app

# Copy manifests
COPY Cargo.toml Cargo.lock ./

# Copy source code
COPY src ./src

# Build for release
RUN cargo build --release

# Runtime stage
FROM debian:bookworm-slim

# Install CA certificates for HTTPS requests
RUN apt-get update && \
    apt-get install -y ca-certificates sqlite3 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the binary from builder stage
COPY --from=builder /app/target/release/cord-service .

# Create directory for database
RUN mkdir -p data

# Expose port
EXPOSE 3001

# Set environment variables
ENV DATABASE_URL=sqlite:./data/cord.db
ENV HOST=0.0.0.0
ENV PORT=3001
ENV RUST_LOG=info

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

# Run the binary
CMD ["./cord-service"]