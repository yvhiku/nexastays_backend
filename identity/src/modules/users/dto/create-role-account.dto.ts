import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

const ROLE_TYPES = ['DRIVER', 'COURIER', 'HOST', 'MERCHANT'] as const;

export class CreateRoleAccountDto {
  @IsString()
  @IsNotEmpty()
  phone_number: string;

  @IsString()
  @IsIn(ROLE_TYPES)
  account_type: (typeof ROLE_TYPES)[number];

  /** Canonical identity root; required. Phone must match identity. */
  @IsUUID()
  @IsNotEmpty()
  unified_identity_id: string;

  /** Optional: explicit CONSUMER id. Prefer identity resolution (getConsumerForIdentity). */
  @IsOptional()
  @IsUUID()
  linked_user_id?: string | null;

  @IsOptional()
  @IsString()
  full_name?: string;
}
