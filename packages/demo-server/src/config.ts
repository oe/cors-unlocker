/**
 * Server configuration interface
 */
export interface IServerConfig {
  /**
   * Port number for the server
   */
  port: number;
  /**
   * Host address to bind to
   */
  host: string;
  /**
   * Enable development mode features
   */
  isDev: boolean;
  /**
   * CORS configuration
   */
  cors: {
    /**
     * Allowed origins for CORS
     */
    allowedOrigins: string[];
    /**
     * Allowed HTTP methods
     */
    allowedMethods: string[];
    /**
     * Allowed headers
     */
    allowedHeaders: string[];
    /**
     * Whether to allow credentials
     */
    allowCredentials: boolean;
    /**
     * Maximum age for preflight cache
     */
    maxAge: number;
  };
}

/**
 * Default server configuration
 */
export const config: IServerConfig = {
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || '0.0.0.0',
  isDev: process.env.NODE_ENV !== 'production',
  cors: {
    allowedOrigins: [
      'http://localhost:3000',
      'http://abc.localhost:3000',
      'http://api.localhost:3000',
      'http://app.localhost:3000',
      'http://127.0.0.1:3000',
    ],
    allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
      'X-Custom-Token',
      'X-API-Key',
      'X-Client-Version',
    ],
    allowCredentials: true,
    maxAge: 86400, // 24 hours
  },
};
