/**
 * User data interface for API responses
 */
export interface IUser {
  /**
   * Unique user identifier
   */
  id: number;
  /**
   * User's full name
   */
  name: string;
  /**
   * User's email address
   */
  email: string;
  /**
   * User creation timestamp
   */
  createdAt: string;
  /**
   * User's role
   */
  role?: string;
}

/**
 * API response wrapper interface
 */
export interface IApiResponse<T = any> {
  /**
   * Whether the request was successful
   */
  success: boolean;
  /**
   * Response data
   */
  data?: T;
  /**
   * Error message if request failed
   */
  message?: string;
  /**
   * Response timestamp
   */
  timestamp: string;
}

/**
 * Request headers interface
 */
export interface IRequestHeaders {
  /**
   * Content type header
   */
  'content-type'?: string;
  /**
   * Authorization header
   */
  authorization?: string;
  /**
   * Custom token header
   */
  'x-custom-token'?: string;
  /**
   * API key header
   */
  'x-api-key'?: string;
  /**
   * Client version header
   */
  'x-client-version'?: string;
  /**
   * Origin header
   */
  origin?: string;
  /**
   * User agent header
   */
  'user-agent'?: string;
}

/**
 * Error response interface
 */
export interface IErrorResponse {
  /**
   * HTTP status code
   */
  status: number;
  /**
   * Error message
   */
  message: string;
  /**
   * Error code for programmatic handling
   */
  code: string;
  /**
   * Additional error details
   */
  details?: any;
}

/**
 * Login request interface
 */
export interface ILoginRequest {
  /**
   * User email or username
   */
  email: string;
  /**
   * User password
   */
  password: string;
}

/**
 * Login response interface
 */
export interface ILoginResponse {
  /**
   * Authentication token
   */
  token: string;
  /**
   * User information
   */
  user: IUser;
  /**
   * Token expiration time
   */
  expiresAt: string;
}
