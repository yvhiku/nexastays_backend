import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AccountTypeGuard } from '../../common/guards/account-type.guard';
import { AccountTypes } from '../../common/decorators/account-type.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RecipientsService } from './recipients.service';
import {
  RecipientBatchMatchDto,
  RecipientLookupDto,
} from './dto/recipient-lookup.dto';

@ApiTags('Pay Recipients')
@Controller(['recipients', 'pay/recipients'])
@UseGuards(JwtAuthGuard, AccountTypeGuard)
@AccountTypes('CONSUMER')
export class RecipientsController {
  constructor(private readonly recipientsService: RecipientsService) {}

  @Post('lookup')
  async lookup(@Body() body: RecipientLookupDto) {
    return this.recipientsService.lookup(body.phone_number);
  }

  @Post('match-phones')
  async matchPhones(@Body() body: RecipientBatchMatchDto) {
    const matches = await this.recipientsService.matchPhones(
      body.phone_numbers ?? [],
    );
    return { matches };
  }

  @Get('recent')
  async recent(
    @CurrentUser() user: { userId: string },
    @Query('limit') limitRaw?: string,
  ) {
    const limit = limitRaw ? parseInt(limitRaw, 10) : 12;
    const recipients = await this.recipientsService.recentRecipients(
      user.userId,
      Number.isFinite(limit) ? limit : 12,
    );
    return { recipients };
  }
}
