import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SeoGuide } from './entities/seo-guide.entity';
import { SeoDestination } from './entities/seo-destination.entity';
import { DestinationIntelligenceService } from './destination-intelligence.service';
import { SeoContentCmsService } from './seo-content-cms.service';
import type { GeoBlockDto } from './seo.types';
import type { DestinationIntelligence } from './seo.types';

@Injectable()
export class SeoContentPipelineService {
  constructor(
    @InjectRepository(SeoGuide)
    private readonly guideRepo: Repository<SeoGuide>,
    @InjectRepository(SeoDestination)
    private readonly destinationRepo: Repository<SeoDestination>,
    private readonly intelligence: DestinationIntelligenceService,
    private readonly cms: SeoContentCmsService,
  ) {}

  /** Generate an AI-style draft from live marketplace data + templates. */
  async generateGuideDraft(guideId: string, adminUserId?: string): Promise<{ draftId: string }> {
    const guide = await this.guideRepo.findOne({
      where: { id: guideId },
      relations: ['destination'],
    });
    if (!guide) throw new NotFoundException('Guide not found');

    const dest = guide.destination_id
      ? await this.destinationRepo.findOne({ where: { id: guide.destination_id } })
      : null;

    let intel: DestinationIntelligence | null = null;
    if (dest) {
      intel = await this.intelligence.compute({ city: dest.search_city });
    }

    const blocks: GeoBlockDto[] = [];
    if (intel && intel.listingCount > 0) {
      blocks.push({
        question: `How many verified stays in ${dest?.name ?? 'Morocco'}?`,
        answer: `${intel.listingCount} live listings on Nexa Stays (${intel.verifiedCount} with verified walkthrough).`,
        statKey: 'listingCount',
      });
      if (intel.avgNightlyPrice != null) {
        blocks.push({
          question: 'Average nightly price?',
          answer: `Around ${intel.avgNightlyPrice} ${intel.currency}/night based on live listings.`,
          statKey: 'avgNightlyPrice',
        });
      }
    }

    const title = dest?.name ?? 'Morocco';
    const html = this.buildDraftHtml(guide.guide_type, title, dest, intel, blocks);

    const draft = await this.cms.saveDraft({
      entityType: 'guide',
      entityId: guide.id,
      locale: guide.locale,
      fieldName: 'body_html',
      contentHtml: html,
      createdBy: adminUserId,
    });

    return { draftId: draft.id };
  }

  private buildDraftHtml(
    guideType: string,
    title: string,
    dest: SeoDestination | null,
    intel: Awaited<ReturnType<DestinationIntelligenceService['compute']>> | null,
    blocks: GeoBlockDto[],
  ): string {
    const intro =
      guideType === 'seasonal'
        ? `<p>Planning when to visit ${title}? This draft was generated from Nexa Stays marketplace data.</p>`
        : guideType === 'experience'
          ? `<p>Discover top experiences in ${title}. Use verified stays as your base while exploring.</p>`
          : guideType === 'event'
            ? `<p>Travel tips for special periods in Morocco. Confirm dining and check-in details with your host.</p>`
            : `<p>Your complete travel guide to ${title} — neighborhoods, pricing, and verified stays on Nexa Stays.</p>`;

    const stats =
      intel && intel.listingCount > 0
        ? `<p><strong>Live marketplace snapshot:</strong> ${intel.listingCount} listings` +
          (intel.avgNightlyPrice != null
            ? `, average ${intel.avgNightlyPrice} ${intel.currency}/night`
            : '') +
          '.</p>'
        : '';

    const faq =
      blocks.length > 0
        ? `<h2>Common questions</h2><ul>${blocks.map((b) => `<li><strong>${b.question}</strong> ${b.answer}</li>`).join('')}</ul>`
        : '';

    const bestTime = dest?.best_time_to_visit
      ? `<p><strong>Best time to visit:</strong> ${dest.best_time_to_visit}</p>`
      : '';

    return `${intro}${stats}${bestTime}${faq}<p><em>Draft — review before publishing.</em></p>`;
  }
}
