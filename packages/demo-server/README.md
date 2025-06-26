# Demo Server

A demonstration server for testing CORS functionality with the CORS Unlocker extension.

## Overview

This server provides various endpoints to test different CORS scenarios including:

- Simple CORS requests
- Preflight requests
- Requests with credentials
- Custom headers testing
- Different HTTP methods
- Error scenarios

## Quick Start

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev
```

The server will start on `http://localhost:3000` by default.

## Testing Domains

You can test cross-origin requests using these local domains:

- `http://abc.localhost:3000` - Primary test domain
- `http://api.localhost:3000` - API simulation domain
- `http://app.localhost:3000` - Application domain

All domains point to the same server but allow testing cross-origin scenarios.

## Available Endpoints

### Basic Endpoints

- `GET /` - Server information and available endpoints
- `GET /health` - Health check endpoint
- `GET /time` - Current server time

### CORS Testing Endpoints

- `GET /api/users` - Simple GET request
- `POST /api/users` - POST request with JSON body
- `PUT /api/users/:id` - PUT request with parameters
- `DELETE /api/users/:id` - DELETE request
- `OPTIONS /api/*` - Preflight request handler

### Authentication Testing

- `GET /api/protected` - Requires authentication headers
- `POST /api/login` - Login simulation
- `GET /api/profile` - Profile data with credentials

### Custom Headers Testing

- `GET /api/custom-headers` - Responds with custom headers
- `POST /api/custom-headers` - Accepts custom headers
- `GET /api/headers-echo` - Echoes received headers

### Error Scenarios

- `GET /api/error/:code` - Returns specific HTTP error codes
- `GET /api/timeout` - Simulates timeout (5s delay)
- `GET /api/large` - Returns large response (for testing)

## Usage Examples

### Testing with CORS Unlocker

1. Open `http://abc.localhost:3000` in your browser
2. Try making requests to `http://api.localhost:3000/api/users`
3. Enable CORS Unlocker for the domain
4. Test various scenarios with/without credentials

### Using curl

```bash
# Simple request
curl http://localhost:3000/api/users

# With custom headers
curl -H "X-Custom-Token: test123" http://localhost:3000/api/custom-headers

# POST with JSON
curl -X POST -H "Content-Type: application/json" \
  -d '{"name":"John","email":"john@example.com"}' \
  http://localhost:3000/api/users
```

## Development

The server is built with:

- **Hono** - Fast web framework
- **TypeScript** - Type safety
- **tsx** - TypeScript execution with hot reload

Server configuration can be modified in `src/config.ts`.
