import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { randomInt } from 'crypto';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuditService } from '../audit/audit.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { PasswordResetToken } from '../../database/entities/password-reset-token.entity';
import { EmailService } from '../email/email.service';

@Injectable()
export class AuthService {
    constructor(
        private usersService: UsersService,
        private jwtService: JwtService,
        private auditService: AuditService,
        @InjectRepository(PasswordResetToken)
        private passwordResetTokenRepo: Repository<PasswordResetToken>,
        private emailService: EmailService,
    ) { }

    async validateUser(matricule: string, pass: string): Promise<any> {
        const user = await this.usersService.findOneByMatricule(matricule);

        if (!user) {
            return null;
        }

        if (!user.isActive) {
            throw new UnauthorizedException('Account is inactive');
        }

        if (user.failedLoginAttempts >= 5) {
            throw new UnauthorizedException('Account locked due to too many failed login attempts. Contact Admin.');
        }

        if (await bcrypt.compare(pass, user.password)) {
            await this.usersService.logSuccessfulLogin(user.id);

            await this.auditService.log(
                user.id,
                'USER_LOGIN',
                user.id,
                'User',
                { matricule: user.matricule },
                undefined,
                { matricule: user.matricule, role: user.role?.name || 'EMPLOYEE' }
            );

            const { password, ...result } = user;
            return result;
        }

        await this.usersService.logFailedLogin(matricule);
        return null;
    }

    async login(user: any) {
        const role = user.role?.name || 'EMPLOYEE';
        const payload = {
            username: user.matricule,
            matricule: user.matricule,
            sub: user.id,
            role: role,
            full_name: user.fullName,
            mustChangePassword: user.mustChangePassword
        };

        const userResponse = { ...user, role: payload.role };
        if (role !== 'EMPLOYEE') {
            delete userResponse.pointsBalance;
            delete userResponse.points_balance;
        }

        return {
            access_token: this.jwtService.sign(payload),
            user: userResponse,
        };
    }

    async changePassword(userId: number, oldPassword: string, newPassword: string): Promise<void> {
        const user = await this.usersService.findByIdWithPassword(userId);
        if (!user) throw new UnauthorizedException('User not found');

        if (!(await bcrypt.compare(oldPassword, user.password))) {
            throw new UnauthorizedException('Incorrect old password');
        }

        const hasLetters = /[a-zA-Z]/.test(newPassword);
        const hasNumbers = /\d/.test(newPassword);

        if (newPassword.length < 8 || !hasLetters || !hasNumbers) {
            throw new BadRequestException('Password must be at least 8 characters long and contain both letters and numbers');
        }

        if (await bcrypt.compare(newPassword, user.password)) {
            throw new BadRequestException('New password must be different from the old password');
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await this.usersService.update(userId, {
            password: hashedPassword,
            mustChangePassword: false
        });
    }

    async forgotPassword(matricule: string, email: string): Promise<void> {
        const user = await this.usersService.findOneByMatricule(matricule);

        if (!user) {
            return; // Generic response — do not reveal user existence
        }

        if (!user.personalEmail) {
            throw new BadRequestException('Please contact HR Admin to update your recovery email.');
        }

        if (user.personalEmail !== email && user.email !== email) {
            return; // Generic response — do not reveal email mismatch
        }

        // Rate-limit: one active token per user at a time
        const recentToken = await this.passwordResetTokenRepo.findOne({
            where: {
                userId: user.id,
                used: false,
                expiresAt: MoreThan(new Date())
            },
            order: { createdAt: 'DESC' }
        });

        if (recentToken) {
            // An unexpired code already exists — silently return to prevent spam
            return;
        }

        // Use cryptographically secure random integer (not Math.random)
        const code = randomInt(100000, 1000000).toString();
        const codeHash = await bcrypt.hash(code, 10);

        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + 10);

        const token = this.passwordResetTokenRepo.create({
            userId: user.id,
            codeHash,
            expiresAt,
            used: false
        });

        await this.passwordResetTokenRepo.save(token);

        const targetEmail = user.personalEmail ?? user.email;
        await this.emailService.sendPasswordResetEmail(targetEmail, code, 10);

        await this.auditService.log(
            user.id,
            'PASSWORD_RESET_REQUESTED',
            user.id,
            'User',
            { matricule: user.matricule }
        );
    }

    async resetPassword(matricule: string, code: string, newPassword: string): Promise<void> {
        const user = await this.usersService.findOneByMatricule(matricule);
        if (!user) {
            throw new BadRequestException('Invalid reset request');
        }

        const token = await this.passwordResetTokenRepo.findOne({
            where: {
                userId: user.id,
                used: false,
                expiresAt: MoreThan(new Date())
            },
            order: { createdAt: 'DESC' }
        });

        if (!token) {
            throw new BadRequestException('Invalid or expired verification code');
        }

        const isCodeValid = await bcrypt.compare(code, token.codeHash);
        if (!isCodeValid) {
            throw new BadRequestException('Invalid or expired verification code');
        }

        const hasLetters = /[a-zA-Z]/.test(newPassword);
        const hasNumbers = /\d/.test(newPassword);

        if (newPassword.length < 8 || !hasLetters || !hasNumbers) {
            throw new BadRequestException('Password must be at least 8 characters long and contain both letters and numbers');
        }

        // Invalidate token BEFORE updating password — prevents replay even on partial failure
        token.used = true;
        await this.passwordResetTokenRepo.save(token);

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await this.usersService.update(user.id, {
            password: hashedPassword,
            mustChangePassword: false
        });

        await this.auditService.log(
            user.id,
            'PASSWORD_RESET_COMPLETED',
            user.id,
            'User',
            { matricule: user.matricule }
        );
    }
}
