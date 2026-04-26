import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { User } from './user.entity';

@Entity('employee_sanctions')
@Index('idx_sanctions_employee_id', ['employeeId'])
@Index('idx_sanctions_matricule', ['matricule'])
@Index('idx_sanctions_record_date', ['recordDate'])
export class EmployeeSanction {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'employee_id' })
  employee: User;

  @Column({ name: 'employee_id', nullable: true })
  employeeId: number;

  @Column({ name: 'matricule', length: 50 })
  matricule: string;

  @Column({ name: 'renvoi_count', default: 0 })
  renvoiCount: number;

  @Column({ name: 'renvoi_prolonge_count', default: 0 })
  renvoiProlongeCount: number;

  @Column({ name: 'sans_questionnaire_count', default: 0 })
  sansQuestionnaireCount: number;

  @Column({ name: 'absence_continue_count', default: 0 })
  absenceContinueCount: number;

  @Column({ name: 'maladie_days', default: 0 })
  maladieDays: number;

  @Column({ name: 'record_date', type: 'date', nullable: true })
  recordDate: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
