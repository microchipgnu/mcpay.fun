import 'dotenv/config';
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema.js";
import { getDatabaseUrl } from '../lib/env.js';

const pool = new Pool({
    connectionString: getDatabaseUrl(),
    ssl: false
});
const db = drizzle(pool, { schema });

export default db;