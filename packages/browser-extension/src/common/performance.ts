import { logger } from './logger';

/**
 * Simple performance monitoring utility
 * Used for tracking extension performance in development
 */
export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private timers = new Map<string, number>();

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  /**
   * Start timing an operation
   */
  startTimer(label: string): void {
    this.timers.set(label, performance.now());
  }

  /**
   * End timing and log the duration
   */
  endTimer(label: string): number {
    const startTime = this.timers.get(label);
    if (!startTime) {
      logger.warn('Timer not found:', label);
      return 0;
    }

    const duration = performance.now() - startTime;
    this.timers.delete(label);

    logger.debug(`${label}: ${duration.toFixed(2)}ms`);
    return duration;
  }

  /**
   * Clear all timers
   */
  clear(): void {
    this.timers.clear();
  }
}

export const performanceMonitor = PerformanceMonitor.getInstance();
