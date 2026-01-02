import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { User } from './user.entity';

export enum AbsenceType {
    SICK = 'SICK',
    PERSONAL = 'PERSONAL',
    UNAUTHORIZED = 'UNAUTHORIZED',
}

@Entity('absences')
@Index('idx_absences_employee_id', ['employeeId'])
@Index('idx_absences_type', ['type'])
@Index('idx_absences_absence_date', ['absenceDate'])
export class Absence {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ name: 'employee_id' })
    employeeId: number;

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'employee_id' })
    employee: User;

    @Column({
        type: 'varchar',
        length: 20,
        default: AbsenceType.UNAUTHORIZED,
    })
    type: AbsenceType;

    @Column({ default: 1 })
    duration: number; // in days

    @Column({ name: 'absence_date', type: 'date' })
    absenceDate: Date;

    @Column({ name: 'points_deducted', default: 0 })
    pointsDeducted: number;

    @Column({ type: 'text', nullable: true })
    notes: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}

