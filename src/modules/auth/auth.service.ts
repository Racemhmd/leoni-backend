import { AuditService } from '../audit/audit.service';

@Injectable()
export class AuthService {
    constructor(
        private usersService: UsersService,
        private jwtService: JwtService,
        private auditService: AuditService,
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
