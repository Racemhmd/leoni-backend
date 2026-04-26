import { Injectable, ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
    handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
        if (err || !user) {
            throw err || new UnauthorizedException();
        }

        const request = context.switchToHttp().getRequest();
        const url = request.url;

        // Prevent API access if password change is pending (exclude auth endpoints)
        if (user.mustChangePassword) {
            if (!url.includes('/auth/change-password') && !url.includes('/auth/login') && !url.includes('/auth/me')) {
                throw new ForbiddenException('PasswordChangeRequired');
            }
        }

        return user;
    }
}
