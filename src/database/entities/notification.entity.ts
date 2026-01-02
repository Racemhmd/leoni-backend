import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { User } from './user.entity';

export enum NotificationType {
    INFO = 'INFO',
    WARNING = 'WARNING',
    SUCCESS = 'SUCCESS',
    ERROR = 'ERROR',
}

@Entity('notifications')
@Index('idx_notifications_employee_id', ['employeeId'])
@Index('idx_notifications_is_read', ['isRead'])
@Index('idx_notifications_type', ['type'])
@Index('idx_notifications_created_at', ['createdAt'])
export class Notification {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'employee_id' })
    employeeId: number;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'employee_id' })
    employee: User;

    @Column({ length: 255 })
    title: string;

    @Column({ type: 'text' })
    message: string;

    @Column({
        type: 'enum',
        enum: NotificationType,
        default: NotificationType.INFO,
    })
    type: NotificationType;

    @Column({ name: 'is_read', default: false })
    isRead: boolean;

    @Column({ name: 'read_at', type: 'timestamp', nullable: true })
    readAt: Date;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
