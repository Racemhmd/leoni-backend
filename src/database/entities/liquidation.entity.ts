import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

export type LiquidationSessionId = 'FEB' | 'MAY' | 'AUG' | 'NOV';

@Entity('liquidations')
@Index('idx_liquidations_user_id', ['userId'])
@Index('idx_liquidations_date', ['liquidationDate'])
@Index('idx_liquidations_period', ['periodStart', 'periodEnd'])
@Index('idx_liquidations_session', ['session'])
export class Liquidation {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'user_id' })
    userId: number;

    @Column({ name: 'session', length: 3, nullable: true })
    session: LiquidationSessionId;

    @Column({ name: 'points_amount', type: 'decimal', precision: 10, scale: 2, default: 0 })
    pointsAmount: number;

    @Column({ name: 'dt_amount', type: 'decimal', precision: 10, scale: 3, default: 0 })
    dtAmount: number;

    @Column({ name: 'liquidation_date', type: 'date' })
    liquidationDate: Date;

    @Column({ name: 'period_start', type: 'date' })
    periodStart: Date;

    @Column({ name: 'period_end', type: 'date' })
    periodEnd: Date;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
