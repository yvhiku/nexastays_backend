import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsObject,
  Length,
  Matches,
} from 'class-validator';

export class SubmitKycDto {
  @IsString()
  @IsNotEmpty()
  phone_number: string;

  @IsOptional()
  @IsObject()
  documents?: {
    id_document?: boolean;
    selfie?: boolean;
    liveness?: boolean;
  };

  /** Full name from KYC form */
  @IsOptional()
  @IsString()
  full_name?: string;

  /** Date of birth (YYYY-MM-DD) from KYC form */
  @IsOptional()
  @IsString()
  date_of_birth?: string;

  /** Nationality (MA = Moroccan, OTHER) from KYC form */
  @IsOptional()
  @IsString()
  nationality?: string;

  /** ISO-3166 alpha-2 issuing country of ID. Falls back to nationality when omitted. */
  @IsOptional()
  @IsString()
  @Length(2, 2)
  @Matches(/^[a-zA-Z]{2}$/, {
    message: 'document_country must be ISO-3166 alpha-2 (e.g. MA)',
  })
  document_country?: string;

  /** Moroccan ID card number (form or OCR extracted) - stored for admin review */
  @IsOptional()
  @IsString()
  national_id_number?: string;

  /** Email from KYC form - synced to User for admin review */
  @IsOptional()
  @IsString()
  email?: string;

  /** City from KYC form - synced to User profile */
  @IsOptional()
  @IsString()
  city?: string;

  /** App that submitted this KYC: PAY | GO | STAYS. Used to show in the correct admin dashboard. */
  @IsOptional()
  @IsString()
  source?: string;
}
