// Service that will get a ping from an MCP server, will connect to the server and register it in the database.

import { Hono } from "hono";
import { type AuthType } from "../lib/auth.js";

export const runtime = 'nodejs'

const app = new Hono<{ Bindings: AuthType }>({
    strict: false,
})

app.get('/', (c) => {
    return c.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'mcpay-ping'
    });
});

export default app;
