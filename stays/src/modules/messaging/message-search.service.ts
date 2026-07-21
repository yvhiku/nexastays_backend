import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StaysMessage } from './entities/stays-message.entity';
import { StaysConversation } from './entities/stays-conversation.entity';
import { MessagingPermissionsService } from './permissions.service';

export type SearchResultType = 'message' | 'file' | 'photo' | 'link' | 'card';

export interface ConversationSearchResult {
  messageId: string;
  conversationSequence: number;
  resultType: SearchResultType;
  highlight: string;
  snippet: string;
  createdAt: string;
}

@Injectable()
export class MessageSearchService {
  constructor(
    @InjectRepository(StaysMessage)
    private readonly messageRepo: Repository<StaysMessage>,
    @InjectRepository(StaysConversation)
    private readonly convRepo: Repository<StaysConversation>,
    private readonly permissions: MessagingPermissionsService,
  ) {}

  async search(
    conversationId: string,
    userId: string,
    q: string,
    types: SearchResultType[] = ['message', 'file', 'photo', 'link', 'card'],
  ): Promise<ConversationSearchResult[]> {
    const conv = await this.convRepo.findOne({ where: { id: conversationId } });
    if (!conv || !this.permissions.isParticipant(conv, userId)) {
      throw new NotFoundException('Conversation not found');
    }

    const term = q?.trim();
    if (!term || term.length < 2) return [];

    const like = `%${term.replace(/[%_]/g, '')}%`;
    const rows = await this.messageRepo
      .createQueryBuilder('m')
      .where('m.conversation_id = :id', { id: conversationId })
      .andWhere('m.deleted_at IS NULL')
      .andWhere("m.type != 'SYSTEM_INTERNAL'")
      .andWhere(
        `(m.body ILIKE :like OR m.metadata::text ILIKE :like)`,
        { like },
      )
      .orderBy('m.conversation_sequence', 'DESC')
      .take(50)
      .getMany();

    const results: ConversationSearchResult[] = [];
    for (const row of rows) {
      const resultType = this.classify(row);
      if (!types.includes(resultType)) continue;
      const snippet = row.body ?? String((row.metadata as { title?: string })?.title ?? '');
      results.push({
        messageId: row.id,
        conversationSequence: Number(row.conversation_sequence),
        resultType,
        highlight: term,
        snippet: snippet.slice(0, 160),
        createdAt: row.created_at.toISOString(),
      });
    }
    return results;
  }

  private classify(row: StaysMessage): SearchResultType {
    if (row.type === 'IMAGE') return 'photo';
    if (row.type === 'FILE') return 'file';
    if (row.type.endsWith('_CARD')) return 'card';
    const meta = row.metadata as { actions?: Array<{ url?: string }> };
    if (meta.actions?.some((a) => a.url?.startsWith('http'))) return 'link';
    return 'message';
  }
}
