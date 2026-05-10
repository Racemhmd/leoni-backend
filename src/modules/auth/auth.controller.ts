import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards, Get, Request, UnauthorizedException, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { LoginDto } from './dto/login.dto';
import { UsersService } from '../users/users.service';

@Controller('auth')
export class AuthController {
    constructor(
        private authService: AuthService,
        private usersService: UsersService
    ) { }

    @HttpCode(HttpStatus.OK)
    @Post('login')
    async login(@Body() signInDto: LoginDto) {
        const user = await this.authService.validateUser(signInDto.matricule, signInDto.password);
        if (!user) {
            throw new UnauthorizedException('Invalid credentials');
        }
        return this.authService.login(user); // user here is without password
    }

    @UseGuards(JwtAuthGuard)
    @Get('profile')
    getProfile(@Request() req: any) {
        return req.user;
    }

    @UseGuards(JwtAuthGuard)
    @Get('me')
    async getMe(@Request() req: any) {
        // Fetch fresh data including balances and role
        const user = await this.usersService.findById(req.user.id);

        if (!user) {
            throw new NotFoundException('User not found');
        }

        const role = user.role?.name || 'EMPLOYEE';

        const response: any = {
            matricule: user.matricule,
            fullName: user.fullName,
            role: role,
            personalEmail: user.personalEmail,
        };

        if (role === 'EMPLOYEE') {
            response.points_balance = user.pointsBalance;
        }

        // return response; // Just return strict structure
        return {
            ...response,
            leave_balance: user.leaveBalance // Keep leave balance for all or restrict? User asked for points mainly. 
            // "HR_ADMIN and SUPERVISOR users must NOT have points balance"
            // Rules didn't explicitly safeguard leave_balance but context implies "Employee Dashboard" features.
            // I'll leave leave_balance for now as it wasn't strictly forbidden like points.
        };
    }

    @UseGuards(JwtAuthGuard)
    @Post('change-password')
    async changePassword(@Request() req: any, @Body() body: any) {
        if (!body.oldPassword || !body.newPassword) {
            throw new BadRequestException('Old password and new password are required');
        }
        await this.authService.changePassword(req.user.id, body.oldPassword, body.newPassword);
        return { message: 'Password changed successfully' };
    }

    @Post('forgot-password')
    async forgotPassword(@Body() body: any) {
        try {
            console.log(`[Auth Controller] Forgot password request received for matricule: ${body.matricule}`);
            if (!body.matricule || !body.recoveryEmail) {
                console.warn('[Auth Controller] Missing matricule or recoveryEmail in request');
                throw new BadRequestException('Matricule and recoveryEmail are required');
            }
            
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(body.recoveryEmail)) {
                console.warn('[Auth Controller] Invalid email format provided');
                throw new BadRequestException('Invalid email format');
            }
            
            await this.authService.forgotPassword(body.matricule, body.recoveryEmail);
            
            console.log('[Auth Controller] Returning generic success response for forgot password');
            // Always return success even if user not found, for security
            return { message: 'If the information is correct, a reset code has been sent.' };
        } catch (error) {
            if (error instanceof BadRequestException || error instanceof InternalServerErrorException) {
                throw error;
            }
            
            console.error('[Forgot Password Error]:', error);
            
            // Ensure JSON response for server errors
            throw new InternalServerErrorException({
                statusCode: 500,
                message: 'An internal server error occurred',
                error: error.message || 'Unknown error'
            });
        }
    }

    @Post('reset-password')
    async resetPassword(@Body() body: any) {
        try {
            if (!body.matricule || !body.code || !body.newPassword || !body.confirmPassword) {
                throw new BadRequestException('All fields are required');
            }

            if (body.newPassword !== body.confirmPassword) {
                throw new BadRequestException('Passwords do not match');
            }

            await this.authService.resetPassword(body.matricule, body.code, body.newPassword);
            
            return { message: 'Password successfully reset' };
        } catch (error) {
            if (error instanceof BadRequestException) {
                throw error;
            }
            console.error('[Reset Password Error]:', error);
            throw new InternalServerErrorException({
                statusCode: 500,
                message: 'An internal server error occurred',
                error: error.message || 'Unknown error'
            });
        }
    }
}
