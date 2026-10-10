import { IsString, IsOptional, IsIn, ValidateIf, IsNotEmpty } from 'class-validator';

export class CreatePurchaseDto {
  @ValidateIf((o) => !o.shopItemDefId)
  @IsString()
  @IsNotEmpty()
  packId?: string;

  @ValidateIf((o) => !o.packId)
  @IsString()
  @IsNotEmpty()
  shopItemDefId?: string;

  @IsString()
  @IsIn(['stripe', 'crypto_evm', 'crypto_cardano'])
  paymentMethod: 'stripe' | 'crypto_evm' | 'crypto_cardano';
}
