import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { WaitlistService } from './waitlist.service';
import { SubmitWaitlistDto } from './dto/submit-waitlist.dto';

@ApiTags('Waitlist')
@Controller(['waitlist', 'pay/waitlist'])
export class WaitlistController {
  constructor(private readonly waitlistService: WaitlistService) {}

  @Post()
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit waitlist signup (public)' })
  @ApiResponse({ status: 201, description: 'Signup recorded' })
  @ApiResponse({
    status: 400,
    description: 'Validation error',
  })
  async submit(@Body() dto: SubmitWaitlistDto) {
    const entry = await this.waitlistService.submit(dto);
    return { data: entry, message: 'Thank you for joining the waitlist.' };
  }
}
