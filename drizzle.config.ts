// eslint-disable-next-line import/no-extraneous-dependencies
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  dbCredentials: {
    url: 'postgresql://user:password@host:port/dbname',
  },
});
