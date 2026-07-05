import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('referrals')
export class Referral {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'referrer_id' })
  referrerId: string;

  @Column({ type: 'uuid', unique: true, name: 'referred_user_id' })
  referredUserId: string;

  @Column({ type: 'varchar', length: 24, name: 'referral_code' })
  referralCode: string;

  @Column({ type: 'varchar', length: 20, default: 'COMPLETED' })
  status: string;

  @Column({ type: 'boolean', default: false, name: 'reward_granted' })
  rewardGranted: boolean;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt: Date;
}
