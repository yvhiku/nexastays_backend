import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuditService } from './audit.service';

@ApiTags('Pay Admin')
@Controller(['audit', 'pay/audit'])
export class AuditController {
  constructor(private readonly auditService: AuditService) {}
}
