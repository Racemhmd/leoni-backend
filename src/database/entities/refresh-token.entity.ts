import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { User } from './user.entity';

@Entity('refresh_tokens')
@Index('idx_refresh_tokens_token', ['token'])
@Index('idx_refresh_tokens_employee_id', ['employeeId'])
@Index('idx_refresh_tokens_expires_at', ['expiresAt'])
export class RefreshToken {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'employee_id' })
    employeeId: number;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'employee_id' })
    employee: User;

    @Column({ unique: true, length: 500 })
    token: string;

    @Column({ name: 'is_revoked', default: false })
    isRevoked: boolean;

    @Column({ name: 'expires_at', type: 'timestamp' })
    expiresAt: Date;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;
}
