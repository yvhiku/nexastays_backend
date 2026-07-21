import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SeoDestination } from './entities/seo-destination.entity';
import { SeoPageRegistry } from './entities/seo-page-registry.entity';
import { SeoNeighborhood } from './entities/seo-neighborhood.entity';
import { SeoLandmark } from './entities/seo-landmark.entity';
import { SeoDestinationRelation } from './entities/seo-destination-relation.entity';
import { SeoController } from './seo.controller';
import { SeoEngineService } from './seo-engine.service';
import { DestinationIntelligenceService } from './destination-intelligence.service';
import { SeoPageRegistryService } from './seo-page-registry.service';
import { SeoFreshnessEngineService } from './seo-freshness-engine.service';
import { SeoAdminService } from './seo-admin.service';
import { SeoKnowledgeGraphService } from './seo-knowledge-graph.service';
import { StaysListing } from '../stays/entities/stays-listing.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SeoDestination,
      SeoPageRegistry,
      SeoNeighborhood,
      SeoLandmark,
      SeoDestinationRelation,
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
  ],
  exports: [
    SeoEngineService,
    SeoPageRegistryService,
    SeoFreshnessEngineService,
    SeoAdminService,
    SeoKnowledgeGraphService,
  ],
})
export class SeoModule implements OnModuleInit {
  constructor(private readonly freshness: SeoFreshnessEngineService) {}

  onModuleInit(): void {
    void this.freshness.runOnStartup();
  }
}
