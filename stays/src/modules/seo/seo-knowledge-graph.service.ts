import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { SeoDestination } from './entities/seo-destination.entity';
import { SeoDestinationRelation } from './entities/seo-destination-relation.entity';
import type { RelatedDestinationDto, SeoDestinationDto } from './seo.types';

@Injectable()
export class SeoKnowledgeGraphService {
  constructor(
    @InjectRepository(SeoDestinationRelation)
    private readonly relationRepo: Repository<SeoDestinationRelation>,
    @InjectRepository(SeoDestination)
    private readonly destinationRepo: Repository<SeoDestination>,
  ) {}

  async getRelatedDestinations(
    fromDestinationId: string,
    limit = 6,
  ): Promise<RelatedDestinationDto[]> {
    const rows = await this.relationRepo.find({
      where: { from_destination_id: fromDestinationId },
      relations: ['to_destination'],
      order: { weight: 'DESC' },
      take: limit,
    });

    return rows
      .filter((r) => r.to_destination?.content_status === 'published')
      .map((r) => ({
        slug: r.to_destination.slug,
        name: r.to_destination.name,
        relationType: r.relation_type,
        href: `/stays/${r.to_destination.slug}`,
      }));
  }

  async getRelatedBySlug(
    citySlug: string,
    limit = 6,
  ): Promise<RelatedDestinationDto[]> {
    const dest = await this.destinationRepo.findOne({ where: { slug: citySlug } });
    if (!dest) return [];
    return this.getRelatedDestinations(dest.id, limit);
  }

  /** Fallback when graph has no edges — use legacy nearby_city_slugs. */
  async getRelatedWithFallback(
    dest: SeoDestination,
    toDto: (d: SeoDestination) => SeoDestinationDto,
  ): Promise<SeoDestinationDto[]> {
    const graph = await this.getRelatedDestinations(dest.id, 6);
    if (graph.length > 0) {
      const slugs = graph.map((g) => g.slug);
      const rows = await this.destinationRepo.find({
        where: { slug: In(slugs), content_status: 'published' },
      });
      const bySlug = new Map(rows.map((r) => [r.slug, r]));
      return slugs.map((s) => bySlug.get(s)).filter(Boolean).map((d) => toDto(d!));
    }

    const slugs = dest.nearby_city_slugs ?? [];
    if (!slugs.length) return [];
    const rows = await this.destinationRepo.find({
      where: { slug: In(slugs), content_status: 'published' },
    });
    const bySlug = new Map(rows.map((r) => [r.slug, r]));
    return slugs.map((s) => bySlug.get(s)).filter(Boolean).map((d) => toDto(d!));
  }
}
