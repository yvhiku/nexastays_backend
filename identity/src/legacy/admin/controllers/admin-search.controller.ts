import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AdminSearchService } from '../services/admin-search.service';

@ApiTags('Pay Admin')
@Controller(['admin/search', 'pay/admin/search'])
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminSearchController {
  constructor(private readonly adminSearchService: AdminSearchService) {}

  @Get()
  search(@Query('q') q?: string, @Query('limit') limit?: string) {
    return this.adminSearchService.search(
      q ?? '',
      limit != null ? parseInt(limit, 10) : 20,
    );
  }
}
