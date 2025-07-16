import { Hono } from "hono";
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { HTTPException } from 'hono/http-exception';
import api from "./api.js";
import mcpProxy from "./mcp-proxy.js";
import ping from "./ping.js";
import auth from "./auth.js";
import { type AuthType } from "../lib/auth.js";
import { getTrustedOrigins } from "../lib/env.js";

const app = new Hono<{ Bindings: AuthType }>({
    strict: false,
});

// Global middleware
app.use('*', logger());
app.use('*', prettyJSON());

// Specific CORS configuration for auth routes - more restrictive
app.use('/api/auth/*', cors({
    origin: getTrustedOrigins(),
    allowHeaders: ["Content-Type", "Authorization", "Access-Control-Allow-Origin"],
    allowMethods: ["POST", "GET", "OPTIONS", "DELETE", "PUT", "PATCH"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
    credentials: true,
}));

app.use('/api/*', cors({
    origin: getTrustedOrigins(),
    allowHeaders: ["Content-Type", "Authorization", "Access-Control-Allow-Origin"],
    allowMethods: ["POST", "GET", "OPTIONS", "DELETE", "PUT", "PATCH"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
    credentials: true,
}));

// Global CORS configuration - very permissive for all NON-auth routes
app.use('*', async (c, next) => {
    // Skip global CORS if this is an auth route
    if (c.req.path.startsWith('/api/auth/')) {
        await next();
        return;
    }

    else if (c.req.path.startsWith('/api/')) {
        await next();
        return;
    }

    // Apply permissive CORS for non-API routes
    const corsMiddleware = cors({
        // Allow all origins
        origin: (origin) => origin || '*',
        // Allow all headers
        allowHeaders: [
            '*',
            'Content-Type',
            'Authorization',
            'X-Requested-With',
            'Accept',
            'Origin',
            'Access-Control-Allow-Headers',
            'Access-Control-Expose-Headers',
            'X-PAYMENT',
        ],
        // Allow all methods
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH', 'HEAD'],
        // Expose all headers
        exposeHeaders: ['*'],
        // Cache preflight for 24 hours
        maxAge: 86400,
        // Allow credentials
        credentials: true
    });

    return await corsMiddleware(c, next);

});


// Mount routes after middleware
const routes = [
    { logic: auth, basePath: "/api/auth" },
    { logic: api, basePath: "/api" },
    { logic: mcpProxy, basePath: "/mcp" },
    { logic: ping, basePath: "/ping" }
] as const;

routes.forEach((route) => {
    app.basePath("/").route(route.basePath, route.logic);
});

// // Global error handler
app.onError((err, c) => {
    if (err instanceof HTTPException) {
        return err.getResponse();
    }

    console.error('Unhandled error:', err);
    return c.json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    }, 500);
});

// 404 handler
app.notFound((c) => {
    return c.json({
        error: 'Not Found',
        message: `Route ${c.req.method} ${c.req.path} not found`
    }, 404);
});

export const GET = app.fetch;
export const POST = app.fetch;
export const DELETE = app.fetch;
export const PATCH = app.fetch;
export const OPTIONS = app.fetch;
export const PUT = app.fetch;