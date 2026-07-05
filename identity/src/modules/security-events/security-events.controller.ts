import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { SecurityEventsService } from './security-events.service';
import { QuerySecurityEventsDto } from './dto/query-security-events.dto';

@ApiTags('Pay Admin')
@Controller(['admin/security-events', 'pay/admin/security-events'])
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class SecurityEventsController {
  constructor(private readonly securityEventsService: SecurityEventsService) {}

  @Get()
  query(@Query() query: QuerySecurityEventsDto) {
    return this.securityEventsService.queryEvents(query);
  }
}
