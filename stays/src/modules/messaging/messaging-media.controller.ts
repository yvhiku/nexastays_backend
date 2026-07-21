import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Query,
  Res,
  forwardRef,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { createReadStream } from 'fs';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { MessagingMediaService } from './messaging-media.service';
import { StaysService } from '../stays/stays.service';

@ApiTags('messaging-media')
@Controller('messaging/media')
export class MessagingMediaController {
  constructor(
    private readonly media: MessagingMediaService,
    @Inject(forwardRef(() => StaysService))
    private readonly staysService: StaysService,
  ) {}

  @Get('avatars/:userId')
  @Public()
  @ApiOperation({ summary: 'Signed avatar URL (messaging-owned media)' })
  async getAvatar(
    @Param('userId') userId: string,
    @Query('exp') exp: string,
    @Query('v') version: string,
    @Query('sig') sig: string,
    @Res() res: Response,
  ) {
    const expNum = Number(exp);
    if (!sig || !expNum || Date.now() > expNum) {
      throw new NotFoundException();
    }
    const valid = this.media.verifySignature(
      { userId, exp: expNum, v: Number(version) || 1, kind: 'avatar' },
      sig,
    );
    if (!valid) throw new NotFoundException();

    // Avatar bytes resolved when identity S2S is wired; until then clients fall back to initials.
    res.setHeader('Cache-Control', 'public, max-age=3600');
    throw new NotFoundException();
  }

  @Get('listings/:listingId/cover/:mediaId')
  @Public()
  @ApiOperation({ summary: 'Signed listing cover thumbnail for messaging cards' })
  async getListingCover(
    @Param('listingId') listingId: string,
    @Param('mediaId') mediaId: string,
    @Query('exp') exp: string,
    @Query('v') version: string,
    @Query('w') w: string,
    @Query('h') h: string,
    @Query('fit') fit: string,
    @Query('sig') sig: string,
    @Res() res: Response,
  ) {
    const expNum = Number(exp);
    if (!sig || !expNum || Date.now() > expNum) {
      throw new NotFoundException();
    }
    const valid = this.media.verifySignature(
      {
        listingId,
        mediaId,
        exp: expNum,
        v: Number(version) || 1,
        w: Number(w) || 640,
        h: Number(h) || 360,
        fit: fit || 'crop',
        kind: 'listing_cover',
      },
      sig,
    );
    if (!valid) throw new NotFoundException();

    const fullPath = await this.staysService.getListingMediaPath(listingId, mediaId);
    const ext = fullPath.includes('.') ? fullPath.split('.').pop()?.toLowerCase() : '';
    const contentType =
      ext === 'png'
        ? 'image/png'
        : ext === 'webp'
          ? 'image/webp'
          : ext === 'jpg' || ext === 'jpeg'
            ? 'image/jpeg'
            : 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    createReadStream(fullPath).pipe(res);
  }
}
