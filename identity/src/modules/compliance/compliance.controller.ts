import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OtpSessionResolverGuard } from '../../common/guards/otp-session-resolver.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ComplianceService } from './compliance.service';
import { SubmitKycDto } from './dto/submit-kyc.dto';
import { KycStatusQueryDto } from './dto/kyc-status-query.dto';
import { DbCircuitBreakerGuard } from '../../common/guards/db-circuit-breaker.guard';
import { HttpCacheInterceptor } from '../../common/cache/http-cache.interceptor';
import { CacheTTL } from '../../common/cache/cache-ttl.decorator';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('Pay KYC')
@Controller(['kyc', 'pay/kyc'])
export class ComplianceController {
  constructor(private readonly complianceService: ComplianceService) {}

  @Post('submit')
  @SkipThrottle()
  @UseGuards(JwtAuthGuard, OtpSessionResolverGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Submit KYC profile data before Sumsub verification' })
  async submit(
    @CurrentUser() user: { userId: string },
    @Body() body: SubmitKycDto,
    @Req() req: Request,
  ) {
    void req;
    return this.complianceService.submitKyc(user.userId, body);
  }

  @Post(['sumsub/token', 'sumsub/access-token'])
  @SkipThrottle()
  @UseGuards(JwtAuthGuard, OtpSessionResolverGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Create Sumsub SDK access token' })
  async createSumsubToken(
    @CurrentUser() user: { userId: string },
    @Body() body?: { source?: string },
  ) {
    const source = (body?.source || 'PAY').toUpperCase();
    return this.complianceService.createSumsubSdkToken(user.userId, source);
  }

  @Post('sumsub/sync-status')
  @SkipThrottle()
  @UseGuards(JwtAuthGuard, OtpSessionResolverGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Sync Sumsub review status into Nexa KYC records' })
  async syncSumsubStatus(
    @CurrentUser() user: { userId: string },
    @Body() body?: { source?: string },
  ) {
    const source = (body?.source || 'PAY').toUpperCase();
    return this.complianceService.syncSumsubStatus(user.userId, source);
  }

  @Post('sumsub/webhook')
  @Public()
  @SkipThrottle()
  @ApiOperation({ summary: 'Sumsub KYC webhook callback' })
  async sumsubWebhook(
    @Body() payload: Record<string, unknown>,
    @Headers('x-payload-digest') digest?: string,
    @Headers('x-payload-digest-alg') digestAlg?: string,
    @Req() req?: Request & { rawBody?: Buffer },
  ) {
    return this.complianceService.processSumsubWebhook(
      payload,
      req?.rawBody,
      digest,
      digestAlg,
    );
  }

  @Get('status')
  @UseGuards(DbCircuitBreakerGuard)
  @UseInterceptors(HttpCacheInterceptor)
  @CacheTTL(30)
  status(@Query() query: KycStatusQueryDto) {
    return this.complianceService.getStatus(query.phone_number);
  }
}
