import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { User } from './user.entity';
import { Event } from './event.entity';

export enum TransactionType {
    EARNED = 'EARNED',
    DEDUCTED = 'DEDUCTED',
    ADJUSTED = 'ADJUSTED',
    XMALL_PURCHASE = 'XMALL_PURCHASE',
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

    @Column()
    value: number;

    @Column({ type: 'text' })
    description: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}

