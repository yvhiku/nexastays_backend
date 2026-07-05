import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Wallet } from '../../wallets/entities/wallet.entity';
import { LedgerAccount } from '../../ledger/entities/ledger-account.entity';
import { LedgerEntry } from '../../ledger/entities/ledger-entry.entity';
import { LedgerTransaction } from '../../ledger/entities/ledger-transaction.entity';
import { LedgerService } from '../../ledger/ledger.service';
import { AdminWalletsQueryDto } from '../dto/admin-wallets.query.dto';

@Injectable()
export class AdminWalletsService {
  constructor(
    @InjectRepository(Wallet)
    private readonly walletsRepository: Repository<Wallet>,
    @InjectRepository(LedgerAccount)
    private readonly ledgerAccountsRepository: Repository<LedgerAccount>,
    @InjectRepository(LedgerEntry)
    private readonly ledgerEntriesRepository: Repository<LedgerEntry>,
    private readonly ledgerService: LedgerService,
  ) {}

  async getWallets(query: AdminWalletsQueryDto) {
    const qb = this.walletsRepository
      .createQueryBuilder('w')
      .leftJoinAndSelect('w.user', 'user');

    if (query.status && query.status !== 'all') {
      qb.andWhere('w.status = :status', { status: query.status });
    }

    if (query.search) {
      qb.andWhere(
        '(w.id ILIKE :search OR w.user_id ILIKE :search OR user.phone_number ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    qb.orderBy('w.created_at', 'DESC');

    const wallets = await qb.getMany();

    const result = await Promise.all(
      wallets.map(async (w) => {
        const account = await this.ledgerService.getOrCreateWalletAccount(w.id);
        const balance = await this.ledgerService.getBalance(account.id);
        return {
          id: w.id,
          user_id: w.user_id,
          currency: w.currency,
          status: w.status,
          created_at: w.created_at,
          user: w.user
            ? {
                id: w.user.id,
                phone_number: w.user.phone_number,
                full_name: w.user.full_name,
              }
            : null,
          balance: Number(balance),
        };
      }),
    );

    return result;
  }

  async getWallet(id: string) {
    const wallet = await this.walletsRepository.findOne({
      where: { id },
      relations: ['user'],
    });
    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }
    const account = await this.ledgerService.getOrCreateWalletAccount(
      wallet.id,
    );
    const balance = await this.ledgerService.getBalance(account.id);
    return {
      id: wallet.id,
      user_id: wallet.user_id,
      currency: wallet.currency,
      status: wallet.status,
      created_at: wallet.created_at,
      user: wallet.user
        ? {
            id: wallet.user.id,
            phone_number: wallet.user.phone_number,
            full_name: wallet.user.full_name,
          }
        : null,
      balance: Number(balance),
    };
  }

  async getWalletLedger(id: string) {
    const wallet = await this.walletsRepository.findOne({ where: { id } });
    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    const accountIds = await this.ledgerAccountsRepository
      .createQueryBuilder('a')
      .select('a.id', 'id')
      .where('a.wallet_id = :walletId', { walletId: id })
      .getRawMany();

    const ids = accountIds.map((row) => row.id);
    if (ids.length === 0) {
      return [];
    }

    const entries = await this.ledgerEntriesRepository
      .createQueryBuilder('e')
      .leftJoin(LedgerTransaction, 't', 't.id = e.transaction_id')
      .select([
        'e.id as id',
        'e.account_id as account_id',
        'e.amount as amount',
        'e.entry_type as entry_type',
        'e.created_at as created_at',
        't.reference as reference',
        't.description as description',
      ])
      .where('e.account_id IN (:...ids)', { ids })
      .orderBy('e.created_at', 'DESC')
      .getRawMany();

    return entries.map((entry) => ({
      id: entry.id,
      account_id: entry.account_id,
      amount: Number(entry.amount || 0),
      entry_type: entry.entry_type,
      created_at: entry.created_at,
      reference: entry.reference,
      description: entry.description,
    }));
  }
}
