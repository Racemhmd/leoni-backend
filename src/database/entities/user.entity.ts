import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Role } from './role.entity';

export enum UserRole {
  EMPLOYEE = 'EMPLOYEE',
  SUPERVISOR = 'SUPERVISOR',
  HR_ADMIN = 'HR_ADMIN',
}

@Entity('employees')
@Index('idx_employees_matricule', ['matricule'])
@Index('idx_employees_role_id', ['roleId'])
@Index('idx_employees_department', ['department'])
@Index('idx_employees_is_active', ['isActive'])
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true, length: 50 })
  matricule: string;

  @Column({ name: 'full_name', length: 255 })
  fullName: string;

  @Column({ nullable: true, length: 255 })
  email: string;

  @Column({ name: 'personal_email', nullable: true, length: 255 })
  personalEmail: string;

  @Column({ nullable: true, length: 100 })
  department: string;

  @Column({ nullable: true, length: 100 })
  group: string;

  @Column({ nullable: true, length: 100 })
  plant: string;

  @Column({ select: false, length: 255 })
  password: string;

  @Column({ name: 'role_id', nullable: true })
  roleId: number;

  @ManyToOne(() => Role, (role) => role.users, { nullable: true })
  @JoinColumn({ name: 'role_id' })
  role: Role;

  // Legacy role field for backward compatibility (will be deprecated)
  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.EMPLOYEE,
    nullable: true,
  })
  legacyRole: UserRole;

  @Column({ name: 'supervisor_id', nullable: true })
  supervisorId: number;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'supervisor_id' })
  supervisor: User;

  @Column({ name: 'points_balance', type: 'decimal', precision: 10, scale: 2, default: 0 })
  pointsBalance: number;

  @Column({ name: 'leave_balance', default: 0 })
  leaveBalance: number;

  @Column({ name: 'must_change_password', default: true })
  mustChangePassword: boolean;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'failed_login_attempts', default: 0 })
  failedLoginAttempts: number;

  @Column({ name: 'last_login_at', type: 'timestamp', nullable: true })
  lastLoginAt: Date;

  @Column({ name: 'password_updated_at', type: 'timestamp', nullable: true })
  passwordUpdatedAt: Date;

  @Column({ name: 'avatar_url', nullable: true, length: 512 })
  avatarUrl: string;

  @Column({ name: 'fcm_token', nullable: true, length: 512 })
  fcmToken: string;

  @Column({ name: 'phone_number', nullable: true, length: 20 })
  phoneNumber: string;

  @Column({ name: 'notif_push_points', default: true })
  notifPushPoints: boolean;

  @Column({ name: 'notif_push_liquidation', default: true })
  notifPushLiquidation: boolean;

  @Column({ name: 'notif_sms_points', default: false })
  notifSmsPoints: boolean;

  @Column({ name: 'notif_sms_liquidation', default: false })
  notifSmsLiquidation: boolean;

  /**
   * Quand true, l'employé demande à conserver ses points lors de la liquidation
   * trimestrielle au lieu de les convertir en DT.
   * Modifiable via PATCH /users/me/liquidation-preference.
   */
  @Column({ name: 'keep_points_at_liquidation', default: false })
  keepPointsAtLiquidation: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

