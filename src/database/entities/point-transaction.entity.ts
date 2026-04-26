import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { User } from './user.entity';
import { Event } from './event.entity';

export enum TransactionType {
    EARNED = 'EARNED',
    DEDUCTED = 'DEDUCTED',
    ADJUSTED = 'ADJUSTED',
    XMALL_PURCHASE = 'XMALL_PURCHASE',
    LIQUIDATION = 'LIQUIDATION',
}

export enum PointReason {
    BEST_EMPLOYEE = 'BEST_EMPLOYEE',
    BEST_TEAM = 'BEST_TEAM',
    AIP_PLUS = 'AIP_PLUS',
    CIP = 'CIP',
    PRESENCE_MONTH = 'PRESENCE_MONTH',
    PLANT_MANAGER_MOTIVATION = 'PLANT_MANAGER_MOTIVATION',
    UNPLANNED_ABSENCE = 'UNPLANNED_ABSENCE',
    DELAY = 'DELAY',
    DISCIPLINARY_SANCTION = 'DISCIPLINARY_SANCTION',
    XMALL_PURCHASE = 'XMALL_PURCHASE',
    MANUAL_ADJUSTMENT = 'MANUAL_ADJUSTMENT',
    ABSENCE_PENALTY = 'ABSENCE_PENALTY',
    LIQUIDATION = 'LIQUIDATION',
}

@Entity('point_transactions')
@Index('idx_point_transactions_employee_id', ['employeeId'])
@Index('idx_point_transactions_event_id', ['eventId'])
@Index('idx_point_transactions_type', ['type'])
@Index('idx_point_transactions_created_at', ['createdAt'])
export class PointTransaction {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'employee_id' })
    employeeId: number;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'employee_id' })
    employee: User;

    @Column({ name: 'event_id', nullable: true })
    eventId: number;

    @ManyToOne(() => Event, (event) => event.transactions, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'event_id' })
    event: Event;

    @Column({
        type: 'varchar',
        length: 20,
        default: TransactionType.EARNED,
    })
    type: TransactionType;

    @Column({
        type: 'varchar',
        length: 50,
        nullable: true,
    })
    reason: PointReason;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    value: number;

    @Column({ name: 'liquidation_id', nullable: true })
    liquidationId: number;

    @Column({ type: 'text' })
    description: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}

