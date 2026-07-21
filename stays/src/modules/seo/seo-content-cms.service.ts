import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SeoContentVersion } from './entities/seo-content-version.entity';
import { SeoGuide } from './entities/seo-guide.entity';
import { SeoPageRegistryService } from './seo-page-registry.service';
import type { SeoContentVersionDto } from './seo.types';

@Injectable()
export class SeoContentCmsService {
  constructor(
    @InjectRepository(SeoContentVersion)
    private readonly versionRepo: Repository<SeoContentVersion>,
    @InjectRepository(SeoGuide)
    private readonly guideRepo: Repository<SeoGuide>,
    private readonly registry: SeoPageRegistryService,
  ) {}

  async listDrafts(limit = 50): Promise<SeoContentVersionDto[]> {
    const rows = await this.versionRepo.find({
      where: [{ status: 'draft' }, { status: 'review' }],
      order: { created_at: 'DESC' },
      take: Math.min(limit, 200),
    });
    return rows.map((r) => this.toDto(r));
  }

  async submitForReview(versionId: string): Promise<SeoContentVersionDto> {
    const row = await this.versionRepo.findOne({ where: { id: versionId } });
    if (!row) throw new NotFoundException('Content version not found');
    if (row.status !== 'draft') {
      throw new BadRequestException('Only draft versions can be submitted for review');
    }
    row.status = 'review';
    await this.versionRepo.save(row);
    return this.toDto(row);
  }

  async publish(versionId: string, adminUserId: string): Promise<SeoContentVersionDto> {
    const row = await this.versionRepo.findOne({ where: { id: versionId } });
    if (!row) throw new NotFoundException('Content version not found');
    if (row.status !== 'review' && row.status !== 'draft') {
      throw new BadRequestException('Version must be draft or in review to publish');
    }

    const now = new Date();
    row.status = 'published';
    row.approved_by = adminUserId;
    row.published_at = now;
    await this.versionRepo.save(row);

    if (row.entity_type === 'guide' && row.field_name === 'body_html') {
      const guide = await this.guideRepo.findOne({ where: { id: row.entity_id } });
      if (guide) {
        guide.body_html = row.content_html;
        guide.content_status = 'published';
        guide.published_at = now;
        guide.indexable = (guide.seo_score ?? 0) >= 75;
        await this.guideRepo.save(guide);
        await this.registry.syncPageEntry({
          pageType: 'guide',
          slug: guide.slug,
          locale: guide.locale,
          indexable: guide.indexable,
          seoScore: guide.seo_score,
          lastmod: now,
        });
      }
    }

    return this.toDto(row);
  }

  async saveDraft(args: {
    entityType: string;
    entityId: string;
    locale: string;
    fieldName: string;
    contentHtml: string;
    createdBy?: string;
  }): Promise<SeoContentVersionDto> {
    const latest = await this.versionRepo.findOne({
      where: {
        entity_type: args.entityType,
        entity_id: args.entityId,
        locale: args.locale,
        field_name: args.fieldName,
      },
      order: { version: 'DESC' },
    });
    const nextVersion = (latest?.version ?? 0) + 1;
    const row = await this.versionRepo.save(
      this.versionRepo.create({
        entity_type: args.entityType,
        entity_id: args.entityId,
        locale: args.locale,
        version: nextVersion,
        field_name: args.fieldName,
        content_html: args.contentHtml,
        status: 'draft',
        created_by: args.createdBy ?? null,
      }),
    );
    return this.toDto(row);
  }

  private toDto(row: SeoContentVersion): SeoContentVersionDto {
    return {
      id: row.id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      locale: row.locale,
      version: row.version,
      fieldName: row.field_name,
      status: row.status,
      createdAt: row.created_at.toISOString(),
      publishedAt: row.published_at?.toISOString() ?? null,
    };
  }
}
