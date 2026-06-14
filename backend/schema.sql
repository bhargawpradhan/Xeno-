CREATE TABLE IF NOT EXISTS customers (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(255),
    city VARCHAR(255),
    tags JSONB DEFAULT '[]',
    total_spent INTEGER DEFAULT 0,
    total_orders INTEGER DEFAULT 0,
    inactive_days INTEGER DEFAULT 0,
    engagement_score INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS orders (
    id VARCHAR(255) PRIMARY KEY,
    customer_id VARCHAR(255) REFERENCES customers(id) ON DELETE CASCADE,
    total_amount INTEGER NOT NULL,
    status VARCHAR(50) DEFAULT 'paid'
);

CREATE TABLE IF NOT EXISTS segments (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    ai_generated BOOLEAN DEFAULT false,
    rules JSONB,
    campaign_title VARCHAR(255),
    message_draft TEXT,
    channel VARCHAR(50),
    reasoning TEXT
);

CREATE TABLE IF NOT EXISTS campaigns (
    id VARCHAR(255) PRIMARY KEY,
    segment_rules JSONB,
    channel VARCHAR(50),
    message TEXT,
    status VARCHAR(50) DEFAULT 'sending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS communications (
    id VARCHAR(255) PRIMARY KEY,
    campaign_id VARCHAR(255) REFERENCES campaigns(id) ON DELETE CASCADE,
    customer_id VARCHAR(255) REFERENCES customers(id) ON DELETE CASCADE,
    channel VARCHAR(50),
    status VARCHAR(50) DEFAULT 'queued',
    events JSONB DEFAULT '[]',
    retry_count INTEGER DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS activity_log (
    id SERIAL PRIMARY KEY,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS csv_imports (
    id SERIAL PRIMARY KEY,
    row_count INTEGER NOT NULL,
    raw_csv TEXT,
    imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
