import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { User } from './user.entity';

export enum LeaveType {
    ANNUAL_LEAVE = 'ANNUAL_LEAVE', // Congé Annuel
    AUTHORIZED_ABSENCE = 'AUTHORIZED_ABSENCE', // Absence Autorisée (AA)
    INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE', // Congé avec Solde Insuffisant
    // SICK_LEAVE = 'SICK_LEAVE', // Keeping for legacy if needed, or remove if strict
}

export enum LeaveStatus {
    PENDING_SUPERVISOR = 'PENDING_SUPERVISOR', // Initial state, waiting for supervisor in LTG
    APPROVED_SUPERVISOR = 'APPROVED_SUPERVISOR', // Supervisor Approved in LTG
    REJECTED_SUPERVISOR = 'REJECTED_SUPERVISOR', // Supervisor Rejected in LTG
    PENDING_HR = 'PENDING_HR', // Waiting for HR in LTG (after Supervisor approval)
    APPROVED_HR = 'APPROVED_HR', // HR Approved in LTG
    REJECTED_HR = 'REJECTED_HR', // HR Rejected in LTG
    PENDING_LTG = 'PENDING_LTG', // Legacy/Transient state
    APPROVED = 'APPROVED', // Final state
    REJECTED = 'REJECTED', // Final state
    LTG_APPROVED = 'LTG_APPROVED', // Explicit LTG success (Final)
    LTG_REJECTED = 'LTG_REJECTED', // Explicit LTG rejection (Final)
}

@Entity('leave_requests')
@Index('idx_leave_requests_employee_id', ['employeeId'])
@Index('idx_leave_requests_status', ['status'])
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

    @Column({
        name: 'leave_type',
        type: 'varchar',
        length: 50,
        nullable: true,
    })
    leaveType: string;

    @Column({ name: 'start_date', type: 'date' })
    startDate: Date;

    @Column({ name: 'end_date', type: 'date' })
    endDate: Date;

    @Column({
        type: 'varchar',
        length: 50,
        default: LeaveStatus.PENDING_SUPERVISOR,
    })
    status: LeaveStatus;

    @Column({ type: 'text', nullable: true })
    reason: string;

    @Column({ name: 'reviewed_at', type: 'timestamp', nullable: true })
    reviewedAt: Date;

    @Column({ name: 'review_notes', type: 'text', nullable: true })
    reviewNotes: string;

    // Legacy support or generic reviewer field
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

