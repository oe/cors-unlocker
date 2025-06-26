import type { IRuleItem } from '@/types';
import { genRuleId } from './storage';
import { logger } from './logger';

// Preset CORS headers that are commonly needed for credentials mode
export const PRESET_CORS_HEADERS = [
  'Accept',
  'Accept-Language', 
  'Content-Language',
  'Content-Type',
  'Authorization',
  'X-Requested-With',
  'Origin',
  'Referer',
  'X-API-Key',
  'X-Auth-Token',
  'X-CSRF-Token',
  'X-Client-Version',
  'X-Request-ID',
  'Cache-Control'
];

/**
 * Validates HTTP header name format
 */
export function isValidHeaderName(name: string): boolean {
  if (!name || typeof name !== 'string') return false;
  // HTTP header names should match this pattern: token characters (excluding separators)
  return /^[!#$%&'*+\-.0-9A-Z^_`a-z|~]+$/.test(name);
}

/**
 * Parses comma-separated header string into array, filtering out invalid headers
 */
export function parseExtraHeaders(headerString?: string): string[] {
  if (!headerString) return [];
  
  return headerString
    .split(',')
    .map(h => h.trim())
    .filter(h => h && isValidHeaderName(h));
}

/**
 * Merges preset headers with custom headers, removing duplicates (case-insensitive)
 */
export function mergeHeaders(extraHeaders?: string): string[] {
  const customHeaders = parseExtraHeaders(extraHeaders);
  const allHeaders: string[] = [...PRESET_CORS_HEADERS];
  
  // Add custom headers that don't already exist (case-insensitive comparison)
  for (const customHeader of customHeaders) {
    const isDuplicate = allHeaders.some(preset => 
      preset.toLowerCase() === customHeader.toLowerCase()
    );
    
    if (!isDuplicate) {
      allHeaders.push(customHeader);
    }
  }
  
  return allHeaders;
}

/**
 * Validates and normalizes extra headers string
 * Returns { headers: string[], duplicates: string[], invalid: string[] }
 */
export function validateExtraHeaders(extraHeaders: string): {
  headers: string[];
  duplicates: string[];
  invalid: string[];
} {
  const inputHeaders = extraHeaders
    .split(',')
    .map(h => h.trim())
    .filter(h => h);
    
  const valid: string[] = [];
  const duplicates: string[] = [];
  const invalid: string[] = [];
  
  for (const header of inputHeaders) {
    if (!isValidHeaderName(header)) {
      invalid.push(header);
      continue;
    }
    
    // Check if it's a duplicate of preset headers (case-insensitive)
    const isDuplicatePreset = PRESET_CORS_HEADERS.some(preset => 
      preset.toLowerCase() === header.toLowerCase()
    );
    
    if (isDuplicatePreset) {
      duplicates.push(header);
      continue;
    }
    
    // Check if it's a duplicate within the input (case-insensitive)
    const isDuplicateInput = valid.some(existing => 
      existing.toLowerCase() === header.toLowerCase()
    );
    
    if (isDuplicateInput) {
      duplicates.push(header);
      continue;
    }
    
    valid.push(header);
  }
  
  return { headers: valid, duplicates, invalid };
}

export type ICreateRuleOptions = Omit<IRuleItem, 'id' | 'updatedAt' | 'domain' | 'createdAt'> & {
  createdAt?: number;
};

export function createRule(options: ICreateRuleOptions): IRuleItem {
  try {
    if (!options.origin) {
      throw new Error('Origin is required');
    }
    
    const domain = new URL(options.origin).hostname;
    const createdAt = options.createdAt || Date.now();
    return {
      ...options,
      id: genRuleId(),
      createdAt,
      domain,
      updatedAt: createdAt
    };
  } catch (error) {
    logger.error('unable to create rule', error);
    if (error instanceof Error) {
      throw new Error(`Invalid rule options: ${error.message}`);
    }
    throw new Error('Invalid rule options: unable to parse origin URL');
  }
}
