-- migrate:up

-- demote postgres user
GRANT ALL ON DATABASE postgres TO postgres;
GRANT ALL ON SCHEMA auth TO postgres;
GRANT ALL ON SCHEMA extensions TO postgres;
GRANT ALL ON SCHEMA storage TO postgres;
GRANT ALL ON ALL TABLES IN SCHEMA auth TO postgres;
GRANT ALL ON ALL TABLES IN SCHEMA storage TO postgres;
GRANT ALL ON ALL TABLES IN SCHEMA extensions TO postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA auth TO postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA storage TO postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA extensions TO postgres;
GRANT ALL ON ALL ROUTINES IN SCHEMA auth TO postgres;
GRANT ALL ON ALL ROUTINES IN SCHEMA storage TO postgres;
-- permission denied for function pg_stat_statements_reset
-- GRANT ALL ON ALL ROUTINES IN SCHEMA extensions TO postgres;
-- ALTER ROLE postgres NOSUPERUSER CREATEDB CREATEROLE LOGIN REPLICATION BYPASSRLS;

-- migrate:down
