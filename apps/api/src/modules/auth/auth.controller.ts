import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
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
}

@Controller('auth')
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
    return this.authService.verifyWalletSignature(dto.chain, dto.address, dto.signature);
  }

  @Post('wallet/link')
  @UseGuards(AuthGuard('jwt'))
  walletLink(@Body() dto: WalletVerifyDto, @Request() req: any) {
    return this.authService.verifyWalletSignature(dto.chain, dto.address, dto.signature, req.user.id);
  }

  @Post('wallet/complete')
  walletCompleteOnboarding(@Body() dto: WalletCompleteOnboardingDto) {
    return this.authService.completeWalletOnboarding(dto.walletToken, dto.username, dto.email);
  }
}
