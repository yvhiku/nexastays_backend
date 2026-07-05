import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { AppTransaction } from '../../transactions/entities/app-transaction.entity';
import { Ride } from '../../go-taxi/entities/ride.entity';

@Injectable()
export class AdminSearchService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(AppTransaction)
    private readonly txRepo: Repository<AppTransaction>,
    @InjectRepository(Ride)
    private readonly rideRepo: Repository<Ride>,
  ) {}

  async search(q: string, limit: number = 20) {
    const term = `${(q || '').trim()}%`;
    if (!term || term === '%') {
      return { users: [], transactions: [], rides: [] };
    }
    const search = `%${(q || '').trim()}%`;

    const [users, transactions, rides] = await Promise.all([
      this.userRepo
        .createQueryBuilder('u')
        .select(['u.id', 'u.phone_number', 'u.full_name', 'u.email', 'u.account_type'])
        .where(
          '(u.phone_number ILIKE :search OR u.full_name ILIKE :search OR u.email ILIKE :search OR u.id::text = :exact)',
          { search, exact: (q || '').trim() },
        )
        .take(limit)
        .getMany(),
      this.txRepo
        .createQueryBuilder('t')
        .select(['t.id', 't.reference', 't.amount', 't.status', 't.type', 't.created_at'])
        .where('t.reference ILIKE :search OR t.id::text = :exact', {
          search,
          exact: (q || '').trim(),
        })
        .orderBy('t.created_at', 'DESC')
        .take(limit)
        .getMany(),
      this.rideRepo
        .createQueryBuilder('r')
        .select(['r.id', 'r.status', 'r.fare_amount', 'r.created_at'])
        .where('r.id::text ILIKE :search', { search })
        .orderBy('r.created_at', 'DESC')
        .take(limit)
        .getMany(),
    ]);

    return {
      users: users.map((u) => ({
        id: u.id,
        phone_number: u.phone_number,
        full_name: u.full_name,
        email: u.email,
        account_type: u.account_type,
      })),
      transactions: transactions.map((t) => ({
        id: t.id,
        reference: t.reference,
        amount: Number(t.amount),
        status: t.status,
        type: t.type,
        created_at: t.created_at,
      })),
      rides: rides.map((r) => ({
        id: r.id,
        status: r.status,
        fare_amount: Number(r.fare_amount),
        created_at: r.created_at,
      })),
    };
  }
}
