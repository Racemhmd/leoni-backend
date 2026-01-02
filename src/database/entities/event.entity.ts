import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, OneToMany, Index } from 'typeorm';
import { PointTransaction } from './point-transaction.entity';


export enum EventType {
    ATTENDANCE = 'ATTENDANCE',
    PERFORMANCE = 'PERFORMANCE',
    SPECIAL = 'SPECIAL',
}

@Entity('events')
@Index('idx_events_is_active', ['isActive'])
@Index('idx_events_event_type', ['eventType'])
@Index('idx_events_dates', ['startDate', 'endDate'])
export class Event {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ length: 255 })
    name: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({ name: 'point_value', default: 0 })
    pointValue: number;

    @Column({
        name: 'event_type',
        type: 'enum',
        enum: EventType,
        default: EventType.SPECIAL,
    })
    eventType: EventType;

    @Column({ name: 'is_active', default: true })
    isActive: boolean;

    @Column({ name: 'start_date', type: 'timestamp', nullable: true })
    startDate: Date;

    @Column({ name: 'end_date', type: 'timestamp', nullable: true })
    endDate: Date;

    @OneToMany(() => PointTransaction, (transaction) => transaction.event)
    transactions: PointTransaction[];



    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
