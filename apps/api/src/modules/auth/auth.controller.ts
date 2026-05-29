import { Controller, Post, Patch, Body, UseGuards, Request, HttpCode, HttpStatus, Get } from '@nestjs/common';
import { ThrottlerGuard, SkipThrottle, Throttle } from '@nestjs/throttler';
import { IsString, IsEmail, IsOptional, MinLength } from 'class-validator';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';

class RegisterDto {
  @IsString()
  @MinLength(3)
  username: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;
}

class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}

class WalletNonceDto {
  @IsString()
  chain: string;

  @IsString()
  address: string;
}

class WalletVerifyDto {
  @IsString()
  chain: string;

  @IsString()
  address: string;

  @IsString()
  signature: string;

  @IsOptional()
  @IsString()
  key?: string;

  @IsOptional()
  @IsString()
  linkMode?: string;
}

class WalletCompleteOnboardingDto {
  @IsString()
  walletToken: string;

  @IsString()
  @MinLength(3)
  username: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;
}

class ForgotPasswordDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  appUrl?: string;
}

class ResetPasswordDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(6)
  password: string;
}

class SetPasswordDto {
  @IsString()
  @MinLength(6)
  password: string;
}

class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(6)
  newPassword: string;
}

// Whole controller goes through ThrottlerGuard. We `SkipThrottle` the
// `commands` named scope so its 120/min budget doesn't apply here, leaving
// only the stricter `auth` 10/min scope from `app.module.ts` in effect.
@Controller('auth')
@UseGuards(ThrottlerGuard)
@SkipThrottle({ commands: true })
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto.username, dto.email, dto.password);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Post('wallet/nonce')
  walletNonce(@Body() dto: WalletNonceDto) {
    return this.authService.requestWalletNonce(dto.chain, dto.address);
  }

  @Post('wallet/verify')
  walletVerify(@Body() dto: WalletVerifyDto) {
    return this.authService.verifyWalletSignature(dto.chain, dto.address, dto.signature, undefined, dto.key);
  }

  @Post('wallet/link')
  @UseGuards(AuthGuard('jwt'))
  walletLink(@Body() dto: WalletVerifyDto, @Request() req: any) {
    return this.authService.verifyWalletSignature(dto.chain, dto.address, dto.signature, req.user.id, dto.key);
  }

  @Post('wallet/complete')
  walletCompleteOnboarding(@Body() dto: WalletCompleteOnboardingDto) {
    return this.authService.completeWalletOnboarding(dto.walletToken, dto.username, dto.email, dto.password);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @SkipThrottle({ auth: true })
  @Throttle({ forgotPassword: { limit: 3, ttl: 15 * 60_000 } })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.requestPasswordReset(dto.email, dto.appUrl);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.password);
  }

  @Post('set-password')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.NO_CONTENT)
  setPassword(@Body() dto: SetPasswordDto, @Request() req: any) {
    return this.authService.setPassword(req.user.id, dto.password);
  }

  @Patch('change-password')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ auth: { limit: 5, ttl: 15 * 60_000 } })
  changePassword(@Body() dto: ChangePasswordDto, @Request() req: any) {
    return this.authService.changePassword(req.user.id, dto.currentPassword, dto.newPassword);
  }
}
