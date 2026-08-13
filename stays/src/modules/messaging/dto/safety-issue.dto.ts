import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export const SAFETY_ISSUE_CATEGORIES = [
  'FEEL_UNSAFE',
  'SUSPICIOUS_FRAUDULENT',
  'PROPERTY_PROBLEM',
  'THREATS_HARASSMENT',
  'OTHER',
] as const;

export type SafetyIssueCategory = (typeof SAFETY_ISSUE_CATEGORIES)[number];

export class SafetyIssueDto {
  @IsString()
  @IsIn([...SAFETY_ISSUE_CATEGORIES])
  category!: SafetyIssueCategory;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  details?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsUUID('4', { each: true })
  attachmentIds?: string[];
}
