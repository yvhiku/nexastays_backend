import { IsIn, IsNotEmpty } from 'class-validator';

export class PurchaseProSubscriptionDto {
  @IsNotEmpty()
  @IsIn(['monthly', 'yearly'])
  billing_period: 'monthly' | 'yearly';
}
