import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Wallet } from '../../wallets/entities/wallet.entity';
import { LedgerEntry } from './ledger-entry.entity';
import { LedgerNormalBalance } from '../ledger-chart.constants';

@Entity('ledger_accounts')
export class LedgerAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true, name: 'wallet_id' })
  wallet_id: string | null;

  @ManyToOne(() => Wallet, (wallet) => wallet.ledger_accounts)
  @JoinColumn({ name: 'wallet_id' })
  wallet: Wallet;

  @Column({ type: 'boolean', default: false, name: 'system_account' })
  system_account: boolean;

  @Column({ type: 'varchar', length: 36, name: 'account_type' })
  account_type: string;

  @Column({
    type: 'varchar',
    length: 6,
    name: 'normal_balance',
    default: LedgerNormalBalance.CREDIT,
  })
  normal_balance: LedgerNormalBalance;

  @Column({ type: 'boolean', name: 'allow_negative', default: false })
  allow_negative: boolean;

  @Column({ type: 'char', length: 3, name: 'currency', default: 'MAD' })
  currency: string;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  created_at: Date;

  @OneToMany(() => LedgerEntry, (entry) => entry.account)
  entries: LedgerEntry[];
}
