-- Add unique constraint on competitor_data.domain for upsert support
ALTER TABLE competitor_data ADD CONSTRAINT competitor_data_domain_unique UNIQUE (domain);
