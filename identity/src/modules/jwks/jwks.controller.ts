import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { JwtKeysService } from './jwt-keys.service';

@ApiTags('Identity JWKS')
@Controller('.well-known')
export class JwksController {
  constructor(private readonly jwtKeys: JwtKeysService) {}

  @Get('jwks.json')
  @Public()
  @ApiOperation({ summary: 'JSON Web Key Set for verifying Identity-issued JWTs' })
  getJwks() {
    return this.jwtKeys.getJwks();
  }
}
