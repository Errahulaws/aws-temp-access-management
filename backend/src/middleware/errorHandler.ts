import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    ...(err instanceof AppError && { code: err.code, statusCode: err.statusCode }),
  });

  if (err instanceof AppError) {
    const errorResponse: Record<string, unknown> = {
      code: err.code,
      message: err.message,
    };
    if (err.details) errorResponse.details = err.details;
    res.status(err.statusCode).json({ error: errorResponse });
    return;
  }

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  });
}
