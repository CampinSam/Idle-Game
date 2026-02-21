import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { TickModule } from '../tick/tick.module';
import { EventModule } from '../event/event.module';
import { LocationSettlementService } from '../location/location-settlement.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET', 'dev-secret-change-me'),
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN', '7d') },
      }),
    }),
    TickModule,
    EventModule,
  ],
  providers: [AuthService, JwtStrategy, LocationSettlementService],
  controllers: [AuthController],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
