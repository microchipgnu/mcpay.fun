# Environment Variables Configuration

This document describes the environment variables available for configuring API endpoints in the MCPay frontend.

## Available Environment Variables

### Main Configuration

- `NEXT_PUBLIC_API_URL` - Main API base URL (default: `https://api.mcpay.fun/api`)
- `NEXT_PUBLIC_MCP_BASE_URL` - MCP server base URL (default: `https://api.mcpay.fun/mcp`)
- `NEXT_PUBLIC_BACKEND_URL` - Backend server URL for authentication proxy (default: `http://localhost:3000`)

### Environment-Specific URLs (Optional)

- `NEXT_PUBLIC_API_URL_DEV` - Development API URL (used on localhost)
- `NEXT_PUBLIC_MCP_BASE_URL_DEV` - Development MCP URL (used on localhost)
- `NEXT_PUBLIC_API_URL_STAGING` - Staging API URL (used on staging domains)
- `NEXT_PUBLIC_MCP_BASE_URL_STAGING` - Staging MCP URL (used on staging domains)

## Usage Examples

### Local Development
```bash
NEXT_PUBLIC_API_URL=http://localhost:3001/api
NEXT_PUBLIC_MCP_BASE_URL=http://localhost:3001/mcp
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
```

### Staging Environment
```bash
NEXT_PUBLIC_API_URL=https://staging-api.mcpay.fun/api
NEXT_PUBLIC_MCP_BASE_URL=https://staging-api.mcpay.fun/mcp
NEXT_PUBLIC_BACKEND_URL=https://staging-api.mcpay.fun
```

### Production Environment
```bash
NEXT_PUBLIC_API_URL=https://api.mcpay.fun/api
NEXT_PUBLIC_MCP_BASE_URL=https://api.mcpay.fun/mcp
NEXT_PUBLIC_BACKEND_URL=https://api.mcpay.fun
```

## How It Works

The frontend uses a smart URL resolution system that:

1. **Environment Detection**: Automatically detects if you're running on localhost, staging, or production
2. **Dynamic URL Selection**: Uses environment-specific URLs when available
3. **Fallback Strategy**: Falls back to main configuration or default URLs
4. **Utility Functions**: Provides `urlUtils` functions for consistent URL generation

## Implementation

The URL management is handled by the `urlUtils` object in `@/lib/utils`:

- `urlUtils.getApiUrl(endpoint)` - Generate API endpoint URLs
- `urlUtils.getMcpUrl(serverId)` - Generate MCP server URLs
- `urlUtils.getEnvironmentApiUrl()` - Get environment-specific API URL
- `urlUtils.getEnvironmentMcpUrl()` - Get environment-specific MCP URL

All hardcoded URLs have been replaced with these utility functions throughout the codebase. 