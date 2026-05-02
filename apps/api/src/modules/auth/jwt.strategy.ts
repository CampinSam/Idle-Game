import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    const isProduction = process.env.NODE_ENV === 'production';
    const secret = config.get<string>('JWT_SECRET');
    if (!secret) {
      if (isProduction) {
        throw new Error('JWT_SECRET must be set in production');
      }
      // Dev fallback: noisy log so this can never sneak into a real deploy.
      // eslint-disable-next-line no-console
      console.warn('[JwtStrategy] JWT_SECRET not set — using dev fallback. DO NOT USE IN PROD.');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: secret || 'dev-secret-change-me',
    });
  }

  async validate(payload: { sub: string; username: string }) {
    return { id: payload.sub, username: payload.username };
  }
}
