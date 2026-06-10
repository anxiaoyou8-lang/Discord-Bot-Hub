CREATE TABLE IF NOT EXISTS guild_configs (
  id SERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  config_key TEXT NOT NULL,
  config_value TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
  CONSTRAINT uniq_guild_key UNIQUE (guild_id, config_key)
);

CREATE TABLE IF NOT EXISTS artworks (
  id SERIAL PRIMARY KEY,
  message_id TEXT NOT NULL UNIQUE,
  channel_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  author_tag TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  password TEXT NOT NULL,
  file_urls TEXT[] NOT NULL,
  file_names TEXT[] NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS artwork_access_logs (
  id SERIAL PRIMARY KEY,
  artwork_id TEXT NOT NULL,
  artwork_title TEXT NOT NULL,
  accessor_id TEXT NOT NULL,
  accessor_tag TEXT NOT NULL,
  accessed_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS review_threads (
  id SERIAL PRIMARY KEY,
  thread_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  locked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  reviewed_at TIMESTAMP,
  reviewed_by TEXT
);

CREATE TABLE IF NOT EXISTS artwork_watermarks (
  id SERIAL PRIMARY KEY,
  trace_id TEXT NOT NULL UNIQUE,
  artwork_id TEXT NOT NULL,
  artwork_title TEXT NOT NULL,
  accessor_id TEXT NOT NULL,
  accessor_tag TEXT NOT NULL,
  filename TEXT NOT NULL,
  watermark_method TEXT NOT NULL,
  accessed_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS complaint_tickets (
  id SERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  content TEXT NOT NULL,
  attachment_urls TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS thread_subscriptions (
  id SERIAL PRIMARY KEY,
  channel_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  CONSTRAINT uniq_channel_user UNIQUE (channel_id, user_id)
);

CREATE TABLE IF NOT EXISTS suggestion_tickets (
  id SERIAL PRIMARY KEY,
  guild_id TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  upvotes INTEGER NOT NULL DEFAULT 0,
  downvotes INTEGER NOT NULL DEFAULT 0,
  message_id TEXT,
  channel_id TEXT,
  reject_reason TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS suggestion_votes (
  id SERIAL PRIMARY KEY,
  suggestion_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  vote_type TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  CONSTRAINT uniq_suggestion_user UNIQUE (suggestion_id, user_id)
);

CREATE TABLE IF NOT EXISTS trivia (
  id SERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  author_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);
