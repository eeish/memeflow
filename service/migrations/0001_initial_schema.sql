-- Cord Service — initial PostgreSQL schema
-- Replaces the inline SQLite create_tables() + ad-hoc migrations.

CREATE TABLE IF NOT EXISTS users (
    id                TEXT        PRIMARY KEY,
    wallet_address    TEXT        UNIQUE,
    email             TEXT        UNIQUE,
    username          TEXT        UNIQUE NOT NULL,
    avatar_url        TEXT,
    bio               TEXT,
    token_symbol      TEXT        NOT NULL,
    followers_count   BIGINT      NOT NULL DEFAULT 0,
    following_count   BIGINT      NOT NULL DEFAULT 0,
    posts_count       BIGINT      NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
    id                TEXT        PRIMARY KEY,
    user_id           TEXT        NOT NULL,
    title             TEXT        NOT NULL DEFAULT 'Notification',
    content           TEXT        NOT NULL,
    notification_type TEXT        NOT NULL DEFAULT 'general',
    related_id        TEXT,
    detail            TEXT,
    actor_id          TEXT,
    is_read           BOOLEAN     NOT NULL DEFAULT FALSE,
    status            TEXT        NOT NULL DEFAULT 'pending',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS posts (
    id                         TEXT        PRIMARY KEY,
    user_id                    TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content                    TEXT        NOT NULL,
    image_url                  TEXT,
    content_blob_id            TEXT,
    content_protocol_version   TEXT,
    content_hash               TEXT,
    hash_timestamp_ms          BIGINT,
    likes_count                BIGINT      NOT NULL DEFAULT 0,
    comments_count             BIGINT      NOT NULL DEFAULT 0,
    retweets_count             BIGINT      NOT NULL DEFAULT 0,
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_posts_user_id          ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at       ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_content_blob_id  ON posts(content_blob_id);

CREATE TABLE IF NOT EXISTS likes (
    id         TEXT        PRIMARY KEY,
    post_id    TEXT        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id    TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(post_id, user_id)
);

CREATE TABLE IF NOT EXISTS comments (
    id                TEXT        PRIMARY KEY,
    post_id           TEXT        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id           TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content           TEXT        NOT NULL,
    parent_comment_id TEXT,
    likes_count       BIGINT      NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);

CREATE TABLE IF NOT EXISTS follows (
    id           TEXT        PRIMARY KEY,
    follower_id  TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_id TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(follower_id, following_id)
);

CREATE TABLE IF NOT EXISTS media_blobs (
    id             TEXT        PRIMARY KEY,
    post_id        TEXT        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    blob_id        TEXT        NOT NULL,
    content_type   TEXT        NOT NULL,
    size_bytes     BIGINT      NOT NULL,
    checksum       TEXT,
    metadata       TEXT,
    upload_status  TEXT        DEFAULT 'uploaded',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_blobs_post_id ON media_blobs(post_id);

CREATE TABLE IF NOT EXISTS graduation_launches (
    owner_address    TEXT        PRIMARY KEY,
    market_id        TEXT        NOT NULL,
    token_name       TEXT        NOT NULL,
    token_symbol     TEXT        NOT NULL,
    status           TEXT        NOT NULL,
    step             TEXT        NOT NULL,
    error            TEXT,
    package_id       TEXT,
    token_type       TEXT,
    vault_id         TEXT,
    pool_id          TEXT,
    operator_address TEXT        NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_graduation_launches_status ON graduation_launches(status);

CREATE TABLE IF NOT EXISTS swap_events (
    id              TEXT             PRIMARY KEY,
    pool_id         TEXT             NOT NULL,
    trader          TEXT             NOT NULL,
    side            TEXT             NOT NULL,
    sui_amount_mist BIGINT           NOT NULL,
    token_amount    BIGINT           NOT NULL,
    price_sui       DOUBLE PRECISION NOT NULL,
    timestamp_ms    BIGINT           NOT NULL,
    tx_digest       TEXT,
    created_at      TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_swap_events_pool_time ON swap_events(pool_id, timestamp_ms);
