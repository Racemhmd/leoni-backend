import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards, Get, Request, UnauthorizedException, NotFoundException } from '@nestjs/common';
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

        return {
            matricule: user.matricule,
            full_name: user.fullName,
            role: user.role?.name || 'EMPLOYEE',
            points_balance: user.pointsBalance,
            leave_balance: user.leaveBalance
        };
    }

    @UseGuards(JwtAuthGuard)
    @Post('change-password')
    async changePassword(@Request() req: any, @Body() body: any) {
        if (!body.newPassword) {
            throw new Error('New password is required');
        }
        await this.authService.changePassword(req.user.id, body.newPassword);
        return { message: 'Password changed successfully' };
    }
}
