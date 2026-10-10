import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const userId: string | undefined = req.user?.id;
    if (userId) return userId;

    const authHeader: string | undefined = req.headers?.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      try {
        const payload = jwt.decode(token);
        if (payload && typeof payload === 'object' && typeof payload.sub === 'string') {
          return payload.sub;
        }
      } catch {
        // fall through to IP
      }
    }

    return req.ip ?? 'anonymous';
  }
}
