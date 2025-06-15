export interface IRuleItem {
  /**
   * Unique identifier of the rule, auto increment
   */
  id: number;
  /**
   * Timestamp of when rule was created
   * Used for sorting and identification
   */
  createdAt: number;
  /**
   * Domain extracted from the origin
   * Used for grouping rules by domain
   */
  domain: string;
  /**
   * Full origin URL (protocol + hostname + port)
   * The target origin for CORS rules
   */
  origin: string;
  /**
   * Whether to allow CORS requests with credentials
   * - If true: Access-Control-Allow-Origin will be set to the origin (allows cookies/auth headers)
   * - If false: Access-Control-Allow-Origin will be set to '*' (no credentials)
   * Note: Enabling credentials may increase privacy concerns
   */
  credentials?: boolean;
  /**
   * User-provided comment or description for this rule
   * Optional field for documentation purposes
   */
  comment?: string;
  /**
   * Whether the rule is currently disabled
   * Rules are enabled by default (disabled = false)
   */
  disabled?: boolean;
  /**
   * Timestamp of when the rule was last updated
   * Used for conflict resolution and sorting
   */
  updatedAt: number;
}

/**
 * Message types for communication between different parts of the extension
 */
export interface IExtensionMessage {
  /**
   * Type identifier for the message
   */
  type: string;
  /**
   * Optional payload data for the message
   */
  payload?: any;
  /**
   * Window ID for tab-specific messages
   */
  windowId?: number;
}

/**
 * External API message types from web pages
 */
export interface IExternalMessage {
  /**
   * Method name for the API call
   */
  method: 'getRule' | 'isEnabled' | 'enable' | 'disable' | 'openOptions';
  /**
   * Payload containing method-specific data
   */
  payload?: {
    /**
     * Target origin for the operation
     */
    origin: string;
    /**
     * Whether to enable credentials for this origin
     */
    credentials?: boolean;
  };
}

/**
 * Extension configuration interface
 */
export interface IExtConfig {
  /**
   * Whether to enable credentials by default for new rules
   */
  dftEnableCredentials: boolean;
  /**
   * Enable debug logging mode
   */
  debugMode: boolean;
  /**
   * Maximum number of rules allowed (1-1000)
   */
  maxRules: number;
  /**
   * Auto-cleanup disabled rules after X days (0 to disable)
   */
  autoCleanupDays: number;
}

/**
 * Performance metrics interface
 */
export interface IPerformanceMetrics {
  /**
   * Performance data for each labeled operation
   */
  [label: string]: {
    /**
     * Number of times this operation was executed
     */
    count: number;
    /**
     * Average execution time in milliseconds
     */
    averageTime: number;
    /**
     * Total execution time in milliseconds
     */
    totalTime: number;
  };
}

/**
 * Export/Import data structure for rules
 */
export interface IExportData {
  /**
   * Export format version
   */
  version: string;
  /**
   * Timestamp when export was created
   */
  timestamp: number;
  /**
   * Array of exported rules
   */
  rules: IRuleItem[];
}

/**
 * Error response interface for API calls
 */
export interface IErrorResponse {
  /**
   * Human-readable error message
   */
  message: string;
  /**
   * Error type for programmatic handling
   */
  type: 'missing-origin' | 'unsupported-origin' | 'missing-method' | 'unsupported-method' | 'rate-limit' | 'forbidden-origin' | 'invalid-sender';
}

/**
 * API response for checking if origin is enabled
 */
export interface IEnabledResponse {
  /**
   * Whether CORS is enabled for the origin
   */
  enabled: boolean;
  /**
   * Whether credentials are allowed for the origin
   */
  credentials: boolean;
}

/**
 * Generic success response for API operations
 */
export interface ISuccessResponse {
  /**
   * Whether the operation was successful
   */
  success: boolean;
}
