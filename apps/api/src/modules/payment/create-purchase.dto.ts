import { IsString, IsNotEmpty, IsIn } from 'class-validator';

export class CreatePurchaseDto {
  @IsString()
  @IsNotEmpty()
  packId: string;

  @IsString()
  @IsIn(['stripe', 'crypto_evm', 'crypto_cardano'])
  paymentMethod: 'stripe' | 'crypto_evm' | 'crypto_cardano';
}
