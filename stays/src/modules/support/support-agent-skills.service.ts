import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IdentityUserClient } from '../../common/identity/identity-user.client';
import { StaysSupportAgentSkills } from './entities/stays-support-agent-skills.entity';
import {
  canonicalizeAgentCategories,
  canonicalizeAgentLanguages,
} from './support-language';

@Injectable()
export class SupportAgentSkillsService {
  constructor(
    @InjectRepository(StaysSupportAgentSkills)
    private readonly skillsRepo: Repository<StaysSupportAgentSkills>,
    private readonly identityUsers: IdentityUserClient,
  ) {}

  async getForAgent(agentUserId: string) {
    const row = await this.skillsRepo.findOne({
      where: { agent_user_id: agentUserId },
    });
    return this.toPayload(agentUserId, row);
  }

  async putForAgent(
    agentUserId: string,
    input: { languages?: unknown; categories?: unknown },
  ) {
    await this.assertActiveSupportAgent(agentUserId);
    const languages = canonicalizeAgentLanguages(input.languages);
    const categories = canonicalizeAgentCategories(input.categories);
    const existing = await this.skillsRepo.findOne({
      where: { agent_user_id: agentUserId },
    });
    const saved = await this.skillsRepo.save(
      existing
        ? Object.assign(existing, { languages, categories })
        : this.skillsRepo.create({
            agent_user_id: agentUserId,
            languages,
            categories,
          }),
    );
    return this.toPayload(agentUserId, saved);
  }

  private async assertActiveSupportAgent(agentUserId: string) {
    const authz = await this.identityUsers.getAuthz(agentUserId);
    if (!authz) {
      throw new NotFoundException('Support agent not found');
    }
    if (
      authz.account_type !== 'ADMIN' ||
      authz.staff_role !== 'SUPPORT_AGENT' ||
      authz.status !== 'ACTIVE'
    ) {
      throw new UnprocessableEntityException(
        'Skills can only be configured for an active support agent',
      );
    }
  }

  private toPayload(
    agentUserId: string,
    row: StaysSupportAgentSkills | null,
  ) {
    return {
      agentUserId,
      languages: row?.languages ?? [],
      categories: row?.categories ?? [],
      updatedAt: row?.updated_at?.toISOString() ?? null,
    };
  }
}
