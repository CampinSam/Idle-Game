import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface SanitizedBody {
  statusCode: number;
  message: string | string[];
  error?: string;
  requestId?: string;
}

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalHttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string; user?: { id?: string } }>();
    const isProduction = process.env.NODE_ENV === 'production';

    const isHttp = exception instanceof HttpException;
    const status = isHttp
      ? (exception as HttpException).getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const requestId =
      (request as any).id ||
      (request.headers['x-request-id'] as string | undefined) ||
      undefined;

    let body: SanitizedBody = {
      statusCode: status,
      message: 'Internal server error',
      requestId,
    };

    if (isHttp) {
      // HttpException is intentionally surfaced — pass the controller's
      // payload through verbatim so structured responses (e.g. /health/ready
      // returning { status, checks }) survive intact. We only normalise:
      //   - string payloads → wrap as { message }
      //   - always inject statusCode + requestId for trace correlation
      const httpResp = (exception as HttpException).getResponse();
      if (typeof httpResp === 'string') {
        body = { statusCode: status, message: httpResp, requestId };
      } else if (httpResp && typeof httpResp === 'object') {
        body = {
          statusCode: status,
          message: 'Error',
          ...(httpResp as Record<string, unknown>),
          requestId,
        } as SanitizedBody;
      }
    } else if (!isProduction) {
      // In dev, surface raw error messages to make debugging cheap.
      const err = exception as Error;
      body = {
        statusCode: status,
        message: err?.message ?? 'Internal server error',
        error: err?.name,
        requestId,
      };
    }

    // Log everything we can correlate. Stack only on 5xx / non-HttpException.
    const logPayload: Record<string, unknown> = {
      requestId,
      method: request.method,
      url: request.url,
      statusCode: status,
      userId: request.user?.id,
      errorName: (exception as Error)?.name,
    };

    if (status >= 500 || !isHttp) {
      this.logger.error(
        {
          ...logPayload,
          err: exception,
        },
        `Unhandled exception (${status}) ${request.method} ${request.url}`,
      );
    } else if (status >= 400) {
      this.logger.warn(
        logPayload,
        `Client error (${status}) ${request.method} ${request.url}`,
      );
    }

    response.status(status).json(body);
  }
}
