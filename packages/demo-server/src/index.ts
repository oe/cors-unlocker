import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import type { Context } from 'hono';
import { config } from './config';
import { 
  mockUsers, 
  findUserById, 
  createUser, 
  updateUser, 
  deleteUser, 
  generateAuthToken,
  validateAuthToken 
} from './data';
import type { IApiResponse, ILoginRequest, IUser, IErrorResponse } from './types';

const app = new Hono();

// CORS middleware
app.use('*', cors({
  origin: (origin: string) => {
    if (!origin) return '*'; // Allow same-origin requests
    return config.cors.allowedOrigins.includes(origin) ? origin : null;
  },
  allowMethods: config.cors.allowedMethods,
  allowHeaders: config.cors.allowedHeaders,
  credentials: config.cors.allowCredentials,
  maxAge: config.cors.maxAge,
}));

// Request logging middleware
app.use('*', async (c: Context, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;
  console.log(`[${new Date().toISOString()}] ${c.req.method} ${c.req.url} - ${c.res.status} (${duration}ms)`);
});

/**
 * Create standardized API response
 */
function createResponse<T>(data: T, message?: string): IApiResponse<T> {
  return {
    success: true,
    data,
    message,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create error response
 */
function createErrorResponse(status: number, message: string, code: string): IErrorResponse {
  return {
    status,
    message,
    code,
    details: null,
  };
}

/**
 * Extract authorization token from request
 */
function getAuthToken(c: Context): string | null {
  const auth = c.req.header('authorization');
  if (!auth) return null;
  
  const [type, token] = auth.split(' ');
  return type === 'Bearer' ? token : null;
}

// Root endpoint - Server information
app.get('/', (c: Context) => {
  return c.json(createResponse({
    name: 'CORS Demo Server',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/health',
      users: '/api/users',
      protected: '/api/protected',
      login: '/api/login',
      customHeaders: '/api/custom-headers',
      headersEcho: '/api/headers-echo',
      errors: '/api/error/:code',
    },
    testDomains: [
      'http://abc.localhost:3000',
      'http://api.localhost:3000',
      'http://app.localhost:3000',
    ],
  }));
});

// Health check
app.get('/health', (c: Context) => {
  return c.json(createResponse({
    status: 'healthy',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString(),
  }));
});

// Current time endpoint
app.get('/time', (c: Context) => {
  return c.json(createResponse({
    timestamp: new Date().toISOString(),
    unix: Date.now(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }));
});

// API Routes

// Get all users
app.get('/api/users', (c: Context) => {
  return c.json(createResponse(mockUsers, 'Users retrieved successfully'));
});

// Get user by ID
app.get('/api/users/:id', (c: Context) => {
  const id = parseInt(c.req.param('id'));
  const user = findUserById(id);
  
  if (!user) {
    return c.json(createErrorResponse(404, 'User not found', 'USER_NOT_FOUND'), 404);
  }
  
  return c.json(createResponse(user, 'User retrieved successfully'));
});

// Create new user
app.post('/api/users', async (c: Context) => {
  try {
    const body = await c.req.json();
    const { name, email, role } = body;
    
    if (!name || !email) {
      return c.json(createErrorResponse(400, 'Name and email are required', 'VALIDATION_ERROR'), 400);
    }
    
    const newUser = createUser({ name, email, role });
    return c.json(createResponse(newUser, 'User created successfully'), 201);
  } catch (error) {
    return c.json(createErrorResponse(400, 'Invalid JSON body', 'INVALID_JSON'), 400);
  }
});

// Update user
app.put('/api/users/:id', async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id'));
    const body = await c.req.json();
    
    const updatedUser = updateUser(id, body);
    if (!updatedUser) {
      return c.json(createErrorResponse(404, 'User not found', 'USER_NOT_FOUND'), 404);
    }
    
    return c.json(createResponse(updatedUser, 'User updated successfully'));
  } catch (error) {
    return c.json(createErrorResponse(400, 'Invalid request', 'INVALID_REQUEST'), 400);
  }
});

// Delete user
app.delete('/api/users/:id', (c: Context) => {
  const id = parseInt(c.req.param('id'));
  const deleted = deleteUser(id);
  
  if (!deleted) {
    return c.json(createErrorResponse(404, 'User not found', 'USER_NOT_FOUND'), 404);
  }
  
  return c.json(createResponse(null, 'User deleted successfully'));
});

// Login endpoint
app.post('/api/login', async (c: Context) => {
  try {
    const body: ILoginRequest = await c.req.json();
    const { email, password } = body;
    
    if (!email || !password) {
      return c.json(createErrorResponse(400, 'Email and password are required', 'VALIDATION_ERROR'), 400);
    }
    
    // Mock authentication - accept any password for demo
    const user = mockUsers.find(u => u.email === email);
    if (!user) {
      return c.json(createErrorResponse(401, 'Invalid credentials', 'INVALID_CREDENTIALS'), 401);
    }
    
    const token = generateAuthToken(user.id);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    
    return c.json(createResponse({
      token,
      user,
      expiresAt,
    }, 'Login successful'));
  } catch (error) {
    return c.json(createErrorResponse(400, 'Invalid JSON body', 'INVALID_JSON'), 400);
  }
});

// Protected endpoint requiring authentication
app.get('/api/protected', (c: Context) => {
  const token = getAuthToken(c);
  if (!token) {
    return c.json(createErrorResponse(401, 'Authorization token required', 'MISSING_TOKEN'), 401);
  }
  
  const { userId, isValid } = validateAuthToken(token);
  if (!isValid) {
    return c.json(createErrorResponse(401, 'Invalid or expired token', 'INVALID_TOKEN'), 401);
  }
  
  const user = findUserById(userId);
  if (!user) {
    return c.json(createErrorResponse(401, 'User not found', 'USER_NOT_FOUND'), 401);
  }
  
  return c.json(createResponse({
    message: 'Access granted to protected resource',
    user,
    timestamp: new Date().toISOString(),
  }));
});

// User profile endpoint
app.get('/api/profile', (c: Context) => {
  const token = getAuthToken(c);
  if (!token) {
    return c.json(createErrorResponse(401, 'Authorization token required', 'MISSING_TOKEN'), 401);
  }
  
  const { userId, isValid } = validateAuthToken(token);
  if (!isValid) {
    return c.json(createErrorResponse(401, 'Invalid or expired token', 'INVALID_TOKEN'), 401);
  }
  
  const user = findUserById(userId);
  if (!user) {
    return c.json(createErrorResponse(404, 'User not found', 'USER_NOT_FOUND'), 404);
  }
  
  return c.json(createResponse(user, 'Profile retrieved successfully'));
});

// Custom headers endpoint
app.get('/api/custom-headers', (c: Context) => {
  const customToken = c.req.header('x-custom-token');
  const apiKey = c.req.header('x-api-key');
  const clientVersion = c.req.header('x-client-version');
  
  // Set custom response headers
  c.header('X-Server-Version', '1.0.0');
  c.header('X-Processing-Time', Date.now().toString());
  c.header('X-Custom-Response', 'demo-server');
  
  return c.json(createResponse({
    receivedHeaders: {
      customToken,
      apiKey,
      clientVersion,
    },
    responseHeaders: {
      'X-Server-Version': '1.0.0',
      'X-Processing-Time': Date.now().toString(),
      'X-Custom-Response': 'demo-server',
    },
  }));
});

// Accept custom headers in POST
app.post('/api/custom-headers', async (c: Context) => {
  try {
    const body = await c.req.json();
    const customToken = c.req.header('x-custom-token');
    const apiKey = c.req.header('x-api-key');
    
    if (!customToken) {
      return c.json(createErrorResponse(400, 'X-Custom-Token header is required', 'MISSING_HEADER'), 400);
    }
    
    return c.json(createResponse({
      message: 'Custom headers processed successfully',
      receivedData: body,
      headers: { customToken, apiKey },
    }));
  } catch (error) {
    return c.json(createErrorResponse(400, 'Invalid JSON body', 'INVALID_JSON'), 400);
  }
});

// Echo all received headers
app.get('/api/headers-echo', (c: Context) => {
  const headers: Record<string, string> = {};
  
  // Extract all headers from the raw request
  const rawHeaders = c.req.raw.headers;
  rawHeaders.forEach((value, key) => {
    headers[key] = value;
  });
  
  return c.json(createResponse({
    headers,
    count: Object.keys(headers).length,
    origin: c.req.header('origin'),
    userAgent: c.req.header('user-agent'),
  }));
});

// Error testing endpoints
app.get('/api/error/:code', (c: Context) => {
  const code = parseInt(c.req.param('code'));
  const errorMessages: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
  };
  
  const message = errorMessages[code] || 'Unknown Error';
  const statusCode = code >= 200 && code < 600 ? code as any : 500;
  return c.json(createErrorResponse(code, message, `HTTP_${code}`), statusCode);
});

// Timeout simulation
app.get('/api/timeout', async (c: Context) => {
  await new Promise(resolve => setTimeout(resolve, 5000));
  return c.json(createResponse({
    message: 'Request completed after 5 second delay',
    timestamp: new Date().toISOString(),
  }));
});

// Large response for testing
app.get('/api/large', (c: Context) => {
  const largeArray = Array.from({ length: 1000 }, (_, i) => ({
    id: i + 1,
    data: `Large data item ${i + 1}`,
    timestamp: new Date().toISOString(),
    random: Math.random(),
  }));
  
  return c.json(createResponse({
    items: largeArray,
    count: largeArray.length,
    size: JSON.stringify(largeArray).length,
  }));
});

// Start server
const port = config.port;
console.log(`🚀 Demo server starting on http://localhost:${port}`);
console.log(`📝 Test domains:`);
config.cors.allowedOrigins.forEach(origin => {
  console.log(`   ${origin}`);
});

serve({
  fetch: app.fetch,
  port,
});
