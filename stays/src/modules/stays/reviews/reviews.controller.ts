import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  HttpCode,
  HttpStatus,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { createReadStream } from 'fs';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { Response } from 'express';
import { StaysReviewsService } from '../services/stays-reviews.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import {
  CreateReviewDto,
  LegacyCreateReviewDto,
  UpdateReviewDto,
} from './dto/review.dto';
import { detectImageType } from '../../../common/utils/image-type.util';
import { MediaStorageService } from '../../../common/media/media-storage.module';

const MAX_REVIEW_PHOTO_SIZE = 10 * 1024 * 1024;
const REVIEW_UPLOAD_ROOT = process.env.MEDIA_STORAGE_ROOT ?? 'uploads';

@ApiTags('Stays Reviews')
@Controller('stays')
export class ReviewsController {
  constructor(
    private readonly reviewsService: StaysReviewsService,
    private readonly mediaStorage: MediaStorageService,
  ) {}

  @Post('reviews')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit a review for a completed booking' })
  @ApiResponse({ status: 201, description: 'Review created' })
  @ApiResponse({ status: 403, description: 'ReviewNotAllowed' })
  @ApiResponse({ status: 409, description: 'ReviewAlreadyExists' })
  async createReview(
    @CurrentUser() user: { userId: string },
    @Body() body: CreateReviewDto,
  ) {
    return this.reviewsService.createReview(user.userId, body.bookingId, {
      rating: body.rating,
      comment: body.comment,
      assetIds: body.assetIds,
    });
  }

  @Post('bookings/:id/review')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit a listing review for a booking (legacy)' })
  async submitBookingReview(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
    @Body() body: LegacyCreateReviewDto,
  ) {
    return this.reviewsService.createReview(user.userId, id, body);
  }

  @Get('bookings/:bookingId/review')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get review for a booking if it exists' })
  async getBookingReview(
    @Param('bookingId') bookingId: string,
    @CurrentUser() user: { userId: string },
  ) {
    return this.reviewsService.getReviewByBookingId(bookingId, user.userId);
  }

  @Get('listings/:listingId/reviews')
  @Public()
  @ApiOperation({ summary: 'List reviews for a listing' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'sort', required: false, enum: ['newest', 'highest', 'lowest'] })
  async listListingReviews(
    @Param('listingId') listingId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sort') sort?: string,
  ) {
    const p = page ? Number.parseInt(page, 10) : 1;
    const l = limit ? Number.parseInt(limit, 10) : 10;
    const sortVal =
      sort === 'highest' || sort === 'lowest' || sort === 'newest'
        ? sort
        : 'newest';
    return this.reviewsService.listListingReviews(
      listingId,
      Number.isFinite(p) ? p : 1,
      Number.isFinite(l) ? l : 10,
      sortVal,
    );
  }

  @Patch('reviews/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Edit a review within 48 hours' })
  async updateReview(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string },
    @Body() body: UpdateReviewDto,
  ) {
    return this.reviewsService.updateReview(user.userId, id, body);
  }

  @Delete('reviews/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Soft-delete a review (admin)' })
  async deleteReview(@Param('id') id: string) {
    return this.reviewsService.adminSetReviewStatus(id, 'REMOVED');
  }

  @Post('reviews/media/photo')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload a review photo (max 5 per review, 10MB)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_REVIEW_PHOTO_SIZE },
    }),
  )
  async uploadReviewPhoto(
    @CurrentUser() user: { userId: string },
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<{ asset_id: string }> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('No file uploaded');
    }
    if (file.size > MAX_REVIEW_PHOTO_SIZE) {
      throw new BadRequestException('Photo too large. Max 10MB');
    }
    const detected = detectImageType(file.buffer);
    if (!detected) {
      throw new BadRequestException('Invalid image. Use JPEG, PNG, or WebP');
    }
    const ext =
      detected === 'png' ? '.png' : detected === 'webp' ? '.webp' : '.jpg';
    const mime =
      detected === 'png'
        ? 'image/png'
        : detected === 'webp'
          ? 'image/webp'
          : 'image/jpeg';

    if (process.env.MEDIA_SERVICE_URL) {
      const stored = await this.mediaStorage.store({
        buffer: file.buffer,
        relativePath: `reviews/${user.userId}`,
        mimeType: mime,
      });
      return { asset_id: stored.assetId };
    }

    const assetId = randomUUID();
    const dir = path.join(REVIEW_UPLOAD_ROOT, 'reviews');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `review_${assetId}${ext}`), file.buffer);
    return { asset_id: assetId };
  }

  @Get('reviews/media/:assetId')
  @Public()
  @ApiOperation({ summary: 'Get review photo' })
  async getReviewMedia(
    @Param('assetId') assetId: string,
    @Res() res: Response,
  ) {
    const fullPath = await this.reviewsService.getReviewMediaPath(assetId);
    if (fullPath.startsWith('http')) {
      res.redirect(fullPath);
      return;
    }
    const ext = fullPath.includes('.')
      ? fullPath.split('.').pop()?.toLowerCase()
      : '';
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
