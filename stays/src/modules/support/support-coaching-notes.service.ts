import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StaysSupportAgentCoachingNote } from './entities/stays-support-agent-coaching-note.entity';

@Injectable()
export class SupportCoachingNotesService {
  constructor(
    @InjectRepository(StaysSupportAgentCoachingNote)
    private readonly repo: Repository<StaysSupportAgentCoachingNote>,
  ) {}

  async listForAgent(agentUserId: string) {
    const rows = await this.repo.find({
      where: { agent_user_id: agentUserId },
      order: { created_at: 'DESC' },
    });
    return { items: rows.map((row) => this.toRow(row)) };
  }

  async create(
    agentUserId: string,
    createdBy: string,
    input: { note: string; followUpAt?: string | null },
  ) {
    const note = input.note.trim();
    if (!note || note.length > 4000) {
      throw new BadRequestException('Invalid coaching note');
    }
    const saved = await this.repo.save(
      this.repo.create({
        agent_user_id: agentUserId,
        created_by: createdBy,
        note,
        status: 'OPEN',
        follow_up_at: input.followUpAt ? new Date(input.followUpAt) : null,
      }),
    );
    return this.toRow(saved);
  }

  async patch(
    noteId: string,
    actorUserId: string,
    patch: { note?: string; followUpAt?: string | null; status?: 'OPEN' | 'COMPLETED' },
  ) {
    const row = await this.repo.findOne({ where: { id: noteId } });
    if (!row) throw new NotFoundException('Coaching note not found');
    if (row.status === 'COMPLETED' && patch.note !== undefined) {
      throw new ConflictException('Completed coaching notes cannot be edited');
    }
    if (row.status === 'COMPLETED' && patch.status === 'OPEN') {
      throw new ConflictException('Completed coaching notes cannot be reopened');
    }
    if (patch.note !== undefined) {
      const note = patch.note.trim();
      if (!note || note.length > 4000) {
        throw new BadRequestException('Invalid coaching note');
      }
      row.note = note;
    }
    if (patch.followUpAt !== undefined && row.status === 'OPEN') {
      row.follow_up_at = patch.followUpAt ? new Date(patch.followUpAt) : null;
    }
    if (patch.status === 'COMPLETED' && row.status !== 'COMPLETED') {
      row.status = 'COMPLETED';
      row.completed_at = new Date();
      row.completed_by = actorUserId;
    }
    const saved = await this.repo.save(row);
    return this.toRow(saved);
  }

  private toRow(row: StaysSupportAgentCoachingNote) {
    return {
      id: row.id,
      agentUserId: row.agent_user_id,
      createdBy: row.created_by,
      note: row.note,
      status: row.status,
      followUpAt: row.follow_up_at?.toISOString() ?? null,
      completedAt: row.completed_at?.toISOString() ?? null,
      completedBy: row.completed_by,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      followUpOverdue:
        row.status === 'OPEN' &&
        row.follow_up_at != null &&
        row.follow_up_at.getTime() < Date.now(),
    };
  }
}
