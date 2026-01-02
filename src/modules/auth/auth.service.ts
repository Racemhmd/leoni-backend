import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
    constructor(
        private usersService: UsersService,
        private jwtService: JwtService,
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
            const { password, ...result } = user;
            return result;
        }

        await this.usersService.logFailedLogin(matricule);
        return null;
    }

    async login(user: any) {
        const payload = {
            username: user.matricule, // kept for backward compatibility if any
            matricule: user.matricule,
            sub: user.id,
            role: user.role?.name || 'EMPLOYEE',
            full_name: user.fullName,
            mustChangePassword: user.mustChangePassword
        };
        return {
            access_token: this.jwtService.sign(payload),
            user: {
                ...user,
                role: payload.role // Ensure frontend gets the string role immediately
            },
        };
    }

    async changePassword(userId: number, newPassword: string): Promise<void> {
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await this.usersService.update(userId, {
            password: hashedPassword,
            mustChangePassword: false
        });
    }
}
