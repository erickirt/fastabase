-- migrate:up

-- Update future objects' permissions
ALTER DEFAULT PRIVILEGES IN SCHEMA realtime GRANT ALL ON TABLES TO postgres, dashboard_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA realtime GRANT ALL ON SEQUENCES TO postgres, dashboard_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA realtime GRANT ALL ON ROUTINES TO postgres, dashboard_user;

-- migrate:down
