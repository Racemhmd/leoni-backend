import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { User } from './user.entity';

@Entity('audit_logs')
@Index('idx_audit_logs_admin_id', ['adminId'])
@Index('idx_audit_logs_target_id', ['targetId'])
@Index('idx_audit_logs_action', ['action'])
@Index('idx_audit_logs_created_at', ['createdAt'])
export class AuditLog {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'admin_id', nullable: true })
    adminId: number;

    @ManyToOne(() => User, { onDelete: 'SET NULL' })
    @JoinColumn({ name: 'admin_id' })
    admin: User;

    @Column({ name: 'target_id', nullable: true })
    targetId: number; // ID of the entity affected (e.g. user_id)

    @Column({ name: 'target_entity', nullable: true })
    targetEntity: string; // 'User', 'PointTransaction', etc.

    // Snapshot fields to preserve history if admin is deleted
    @Column({ name: 'performer_matricule', nullable: true })
    performerMatricule: string;

    @Column({ name: 'performer_role', nullable: true })
    performerRole: string;

    @Column()
    action: string; // 'CREATE_USER', 'DELETE_USER', 'ADJUST_POINTS', etc.

    @Column()
    action: string; // 'CREATE_USER', 'DELETE_USER', 'ADJUST_POINTS', etc.

    @Column({ type: 'text', nullable: true })
    details: string; // JSON string or text details (e.g. old vs new value)

    @Column({ name: 'ip_address', nullable: true })
    ipAddress: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
