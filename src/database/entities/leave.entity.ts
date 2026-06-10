import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { User } from './user.entity';

export enum LeaveType {
    ANNUAL_LEAVE           = 'ANNUAL_LEAVE',
    AUTHORIZED_ABSENCE     = 'AUTHORIZED_ABSENCE',
    INSUFFICIENT_BALANCE   = 'INSUFFICIENT_BALANCE',
}

export enum LeaveStatus {
    // Active workflow states
    PENDING_SUPERVISOR      = 'PENDING_SUPERVISOR',
    APPROVED_BY_SUPERVISOR  = 'APPROVED_BY_SUPERVISOR',
    REJECTED_BY_SUPERVISOR  = 'REJECTED_BY_SUPERVISOR',
    APPROVED_BY_HR          = 'APPROVED_BY_HR',
    REJECTED_BY_HR          = 'REJECTED_BY_HR',
    // Legacy aliases kept for backward-compat with any existing rows
    APPROVED_SUPERVISOR     = 'APPROVED_BY_SUPERVISOR',
    REJECTED_SUPERVISOR     = 'REJECTED_BY_SUPERVISOR',
    PENDING_HR              = 'APPROVED_BY_SUPERVISOR',  // old PENDING_HR == awaiting HR after sup approved
    APPROVED_HR             = 'APPROVED_BY_HR',
    REJECTED_HR             = 'REJECTED_BY_HR',
    APPROVED                = 'APPROVED_BY_HR',
    REJECTED                = 'REJECTED_BY_SUPERVISOR',
    PENDING_LTG             = 'PENDING_SUPERVISOR',
    LTG_APPROVED            = 'APPROVED_BY_HR',
    LTG_REJECTED            = 'REJECTED_BY_HR',
}

@Entity('leave_requests')
@Index('idx_leave_requests_employee_id', ['employeeId'])
@Index('idx_leave_requests_status', ['status'])
@Index('idx_leave_requests_supervisor_id', ['supervisorId'])
@Index('idx_leave_requests_hr_admin_id', ['hrAdminId'])
@Index('idx_leave_requests_dates', ['startDate', 'endDate'])
export class LeaveRequest {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'employee_id' })
    employeeId: number;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'employee_id' })
    employee: User;

    @Column({ name: 'supervisor_id', nullable: true })
    supervisorId: number;

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: 'supervisor_id' })
    supervisor: User;

    @Column({ name: 'hr_admin_id', nullable: true })
    hrAdminId: number;

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: 'hr_admin_id' })
    hrAdmin: User;

    @Column({ name: 'leave_type', type: 'varchar', length: 50, nullable: true })
    leaveType: string;

    @Column({ name: 'start_date', type: 'date' })
    startDate: Date;

    @Column({ name: 'end_date', type: 'date' })
    endDate: Date;

    @Column({ type: 'varchar', length: 50, default: LeaveStatus.PENDING_SUPERVISOR })
    status: string;

    @Column({ type: 'text', nullable: true })
    reason: string;

    // Supervisor decision
    @Column({ name: 'supervisor_decision_at', type: 'timestamp', nullable: true })
    supervisorDecisionAt: Date;

    @Column({ name: 'supervisor_comment', type: 'text', nullable: true })
    supervisorComment: string | null;

    // HR decision
    @Column({ name: 'hr_decision_at', type: 'timestamp', nullable: true })
    hrDecisionAt: Date;

    @Column({ name: 'hr_comment', type: 'text', nullable: true })
    hrComment: string | null;

    // Legacy generic reviewer fields (kept for audit trail)
    @Column({ name: 'reviewed_at', type: 'timestamp', nullable: true })
    reviewedAt: Date;

    @Column({ name: 'review_notes', type: 'text', nullable: true })
    reviewNotes: string;

    @Column({ name: 'reviewed_by', nullable: true })
    reviewedBy: number;

    @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'reviewed_by' })
    reviewer: User;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
