import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SeoDestination } from './entities/seo-destination.entity';
import { SeoPageRegistry } from './entities/seo-page-registry.entity';
import { SeoNeighborhood } from './entities/seo-neighborhood.entity';
import { SeoLandmark } from './entities/seo-landmark.entity';
import { SeoDestinationRelation } from './entities/seo-destination-relation.entity';
import { SeoGuide } from './entities/seo-guide.entity';
import { SeoContentVersion } from './entities/seo-content-version.entity';
import { SeoGeoRequestLog } from './entities/seo-geo-request-log.entity';
import { SeoController } from './seo.controller';
import { SeoEngineService } from './seo-engine.service';
import { DestinationIntelligenceService } from './destination-intelligence.service';
import { SeoPageRegistryService } from './seo-page-registry.service';
import { SeoFreshnessEngineService } from './seo-freshness-engine.service';
import { SeoAdminService } from './seo-admin.service';
import { SeoKnowledgeGraphService } from './seo-knowledge-graph.service';
import { SeoGuideService } from './seo-guide.service';
import { SeoContentCmsService } from './seo-content-cms.service';
import { SeoContentPipelineService } from './seo-content-pipeline.service';
import { SeoGeoMonitoringService } from './seo-geo-monitoring.service';
import { SeoLandingContent } from './entities/seo-landing-content.entity';
import { SeoLandingContentService } from './seo-landing-content.service';
import { SeoLandingContentSeedService } from './seo-landing-content-seed.service';
import { SeoListingService } from './seo-listing.service';
import { StaysListing } from '../stays/entities/stays-listing.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SeoDestination,
      SeoPageRegistry,
      SeoNeighborhood,
      SeoLandmark,
      SeoDestinationRelation,
      SeoGuide,
      SeoContentVersion,
      SeoGeoRequestLog,
      SeoLandingContent,
      StaysListing,
    ]),
  ],
  controllers: [SeoController],
  providers: [
    SeoEngineService,
    DestinationIntelligenceService,
    SeoPageRegistryService,
    SeoFreshnessEngineService,
    SeoAdminService,
    SeoKnowledgeGraphService,
    SeoGuideService,
    SeoContentCmsService,
    SeoContentPipelineService,
    SeoGeoMonitoringService,
    SeoListingService,
    SeoLandingContentService,
    SeoLandingContentSeedService,
  ],
  exports: [
    SeoEngineService,
    SeoPageRegistryService,
    SeoFreshnessEngineService,
    SeoAdminService,
    SeoKnowledgeGraphService,
    SeoGuideService,
    SeoContentCmsService,
    SeoContentPipelineService,
    SeoGeoMonitoringService,
    SeoListingService,
    SeoLandingContentService,
  ],
})
export class SeoModule implements OnModuleInit {
  constructor(private readonly freshness: SeoFreshnessEngineService) {}

  onModuleInit(): void {
    void this.freshness.runOnStartup();
  }
}
