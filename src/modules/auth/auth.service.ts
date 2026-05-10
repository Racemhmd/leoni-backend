import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuditService } from '../audit/audit.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PasswordResetToken } from '../../database/entities/password-reset-token.entity';
import { EmailService } from '../email/email.service';
import { MoreThan } from 'typeorm';

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

            // Log Login Audit
            await this.auditService.log(
                user.id,
                'USER_LOGIN',
                user.id,
                'User',
                { matricule: user.matricule },
                undefined, // IP not easily available here, handled in Controller usually. 
                // For now undefined, or we pass request to validateUser? 
                // AuthGuard calls validateUser.
                // Let's settle for no IP here for now or pass 'N/A'.
                // The controller can't easily log this because Guard handles it.
                // Guard doesn't pass IP.
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
            username: user.matricule, // kept for backward compatibility if any
            matricule: user.matricule,
            sub: user.id,
            role: role,
            full_name: user.fullName,
            mustChangePassword: user.mustChangePassword
        };

        // Filter user object for frontend
        const userResponse = { ...user, role: payload.role };
        if (role !== 'EMPLOYEE') {
            delete userResponse.pointsBalance;
            delete userResponse.points_balance; // Just in case of different naming conventions in the object
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
        console.log(`[Auth Service] Looking up user with matricule: ${matricule}`);
        const user = await this.usersService.findOneByMatricule(matricule);
        
        if (!user) {
            console.log(`[Auth Service] User not found for matricule: ${matricule}. Returning generic response silently.`);
            return; // Generic response
        }

        console.log(`[Auth Service] User found. Verifying personalEmail existence.`);
        if (!user.personalEmail) {
            console.warn(`[Auth Service] User ${user.id} does not have a personalEmail set. Throwing error.`);
            throw new BadRequestException('Please contact HR Admin to update your recovery email.');
        }

        console.log(`[Auth Service] Comparing provided email with DB personalEmail/enterprise email.`);
        if (user.personalEmail !== email && user.email !== email) {
            console.log(`[Auth Service] Email mismatch for user ${user.id}. Returning generic response silently.`);
            return; // Generic response
        }

        console.log(`[Auth Service] Email matches. Generating reset code.`);
        // Check rate limiting / brute force (Optional but recommended)
        // Here we just limit to not spamming. Let's see if there's a recent token
        const recentToken = await this.passwordResetTokenRepo.findOne({
            where: {
                userId: user.id,
                used: false,
                expiresAt: MoreThan(new Date())
            },
            order: { createdAt: 'DESC' }
        });

        // Generate a 6-digit verification code
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        
        // Hash the code before saving
        const codeHash = await bcrypt.hash(code, 10);

        // Expiration time: 10 minutes
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + 10);

        const token = this.passwordResetTokenRepo.create({
            userId: user.id,
            codeHash,
            expiresAt,
            used: false
        });

        try {
            console.log(`[Auth Service] Saving token to database for user ${user.id}.`);
            await this.passwordResetTokenRepo.save(token);

            console.log(`[Auth Service] Attempting to send reset email via EmailService.`);
            const targetEmail = (user.personalEmail === email) ? user.personalEmail : user.email;
            await this.emailService.sendPasswordResetEmail(targetEmail, code, 10);

            console.log(`[Auth Service] Logging audit event for password reset request.`);
            await this.auditService.log(
                user.id,
                'PASSWORD_RESET_REQUESTED',
                user.id,
                'User',
                { matricule: user.matricule }
            );
        } catch (dbOrEmailError) {
            console.error('[Forgot Password Service Error]:', dbOrEmailError);
            throw dbOrEmailError;
        }
    }

    async resetPassword(matricule: string, code: string, newPassword: string): Promise<void> {
        const user = await this.usersService.findOneByMatricule(matricule);
        if (!user) {
            throw new BadRequestException('Invalid reset request'); // Keep generic
        }

        // Find the latest unused token for this user
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

        // Verify the code
        const isCodeValid = await bcrypt.compare(code, token.codeHash);
        if (!isCodeValid) {
            throw new BadRequestException('Invalid or expired verification code');
        }

        // Validate new password rules
        const hasLetters = /[a-zA-Z]/.test(newPassword);
        const hasNumbers = /\d/.test(newPassword);

        if (newPassword.length < 8 || !hasLetters || !hasNumbers) {
            throw new BadRequestException('Password must be at least 8 characters long and contain both letters and numbers');
        }

        // Update user's password
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await this.usersService.update(user.id, {
            password: hashedPassword,
            mustChangePassword: false
        });

        // Mark token as used
        token.used = true;
        await this.passwordResetTokenRepo.save(token);

        // Audit Log
        await this.auditService.log(
            user.id,
            'PASSWORD_RESET_COMPLETED',
            user.id,
            'User',
            { matricule: user.matricule }
        );
    }
}
