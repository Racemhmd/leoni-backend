import { Controller, Post, Body, Get, UseGuards, Request, UseInterceptors, UploadedFile, BadRequestException, Delete, Param, Patch, NotFoundException, Ip, Query, ForbiddenException, Put } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import { diskStorage } from 'multer';
import { UsersService } from './users.service';
import { PointsService } from '../points/points.service';
import { AuditService } from '../audit/audit.service';
import { User } from '../../database/entities/user.entity';
import { PointReason } from '../../database/entities/point-transaction.entity';
import * as bcrypt from 'bcryptjs';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../../database/entities/user.entity';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';

@Controller('users')
export class UsersController {
    constructor(
        private readonly usersService: UsersService,
        private readonly pointsService: PointsService,
        private readonly auditService: AuditService
    ) { }

    @Post('import/csv')
    @Roles(UserRole.HR_ADMIN)
    @UseGuards(JwtAuthGuard, RolesGuard)
    @ApiOperation({ summary: 'Import employees from Excel/CSV' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                file: {
                    type: 'string',
                    format: 'binary',
                },
            },
        },
    })
    @UseInterceptors(FileInterceptor('file'))
    async importEmployees(@UploadedFile() file: Express.Multer.File, @Request() req: any, @Ip() ip: string) {
        if (!file) {
            throw new BadRequestException('File is required');
        }
        const result = await this.usersService.importEmployees(file);

        await this.auditService.log(
            req.user.id,
            'IMPORT_USERS',
            undefined,
            'User',
            { filename: file.originalname, stats: result },
            ip
        );

        return result;
    }

    @Post()
    @Roles(UserRole.HR_ADMIN)
    @UseGuards(JwtAuthGuard, RolesGuard)
    async create(@Body() userData: Partial<User>, @Request() req: any, @Ip() ip: string) {
        if (userData.password) {
            userData.password = await bcrypt.hash(userData.password, 10);
        }
        const newUser = await this.usersService.create(userData);

        await this.auditService.log(
            req.user.id,
            'CREATE_USER',
            newUser.id,
            'User',
            { matricule: newUser.matricule, role: newUser.role },
            ip
        );

        return newUser;
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.EMPLOYEE, UserRole.SUPERVISOR, UserRole.HR_ADMIN)
    @Get('profile')
    getProfile(@Request() req: any) {
        return this.usersService.findById(req.user.id);
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.EMPLOYEE, UserRole.SUPERVISOR, UserRole.HR_ADMIN)
    @Get('supervisors')
    async getSupervisors() {
        return this.usersService.findSupervisors();
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.EMPLOYEE, UserRole.SUPERVISOR, UserRole.HR_ADMIN)
    @Get('hr-admins')
    async getHrAdmins() {
        return this.usersService.findHrAdmins();
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.HR_ADMIN, UserRole.SUPERVISOR)
    @Get()
    async findAll(@Request() req: any, @Query('role') role?: string) {
        if (req.user.role === UserRole.HR_ADMIN) {
            if (role) {
                return this.usersService.findByRole(role);
            }
            return this.usersService.findAll();
        } else if (req.user.role === UserRole.SUPERVISOR) {
            // Supervisor sees only their team (users who have them as supervisor)
            // Or maybe users in their 'department'? Requirement says "View team members only".
            // Typically this means `supervisor_id = req.user.id`.
            return this.usersService.findBySupervisor(req.user.id);
        } else {
            // Employees should not reach here due to @Roles, but safety check
            throw new ForbiddenException('Access denied');
        }
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.HR_ADMIN)
    @Delete(':matricule')
    async remove(@Param('matricule') matricule: string, @Request() req: any, @Ip() ip: string) {
        const user = await this.usersService.findOneByMatricule(matricule);
        if (!user) {
            throw new NotFoundException('User not found');
        }
        await this.usersService.remove(user.id);

        await this.auditService.log(
            req.user.id,
            'DELETE_USER',
            user.id,
            'User',
            { matricule: user.matricule },
            ip
        );

        return { message: 'User deleted successfully' };
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.HR_ADMIN)
    @Patch(':matricule/points')
    async adjustPoints(@Param('matricule') matricule: string, @Body() body: { points: number; type: string; description: string }, @Request() req: any, @Ip() ip: string) {
        const user = await this.usersService.findOneByMatricule(matricule);
        if (!user) {
            throw new NotFoundException('User not found');
        }
        if (!body.points) throw new BadRequestException('Points amount is required');

        // Positive add, negative deduct? Requirements say "Add points or deduct points".
        // Assuming body.points can be positive or negative.
        // PointsService addPoints handles addition.
        // But wait, PointsController had 'adjust' calling 'addPoints'. 
        // Let's use logic: if points > 0 add, if < 0 deduct.

        const oldBalance = user.pointsBalance;

        const reasonObj = body.type as PointReason || PointReason.MANUAL_ADJUSTMENT;

        if (body.points > 0) {
            await this.pointsService.addPoints(user.id, body.points, reasonObj, body.description || 'Manual Adjustment');
        } else {
            // PointsService.deductPoints already checks for insufficient balance (< 0)
            await this.pointsService.deductPoints(user.id, Math.abs(body.points), reasonObj, body.description || 'Manual Adjustment');
        }

        // Refetch to get updated balance
        const updatedUser = await this.usersService.findById(user.id);
        const newBalance = updatedUser ? updatedUser.pointsBalance : oldBalance + body.points;

        await this.auditService.log(
            req.user.id,
            'ADJUST_POINTS',
            user.id,
            'User',
            {
                admin_matricule: req.user.matricule,
                employee_matricule: user.matricule,
                old_balance: oldBalance,
                new_balance: newBalance,
                reason: body.description || 'Manual Adjustment',
                points_delta: body.points
            },
            ip,
            { matricule: req.user.matricule, role: req.user.role }
        );

        return {
            message: 'Points adjusted successfully',
            old_balance: oldBalance,
            new_balance: newBalance
        };
    }

    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.HR_ADMIN)
    @Patch(':matricule/recovery-email')
    async updateRecoveryEmailByAdmin(
        @Param('matricule') matricule: string,
        @Body() body: { email: string },
        @Request() req: any,
        @Ip() ip: string
    ) {
        if (!body.email) throw new BadRequestException('Email is required');
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(body.email)) {
            throw new BadRequestException('Invalid email format');
        }
        
        const user = await this.usersService.findOneByMatricule(matricule);
        if (!user) throw new NotFoundException('User not found');

        await this.usersService.update(user.id, { personalEmail: body.email });

        await this.auditService.log(
            req.user.id,
            'UPDATE_RECOVERY_EMAIL',
            user.id,
            'User',
            { matricule: user.matricule, newEmail: body.email },
            ip
        );

        return { message: 'Recovery email updated successfully' };
    }

    @UseGuards(JwtAuthGuard)
    @Patch('me/recovery-email')
    async updateMyRecoveryEmail(
        @Body() body: { email: string },
        @Request() req: any,
        @Ip() ip: string
    ) {
        if (!body.email) throw new BadRequestException('Email is required');
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(body.email)) {
            throw new BadRequestException('Invalid email format');
        }
        
        const user = await this.usersService.findById(req.user.id);
        if (!user) throw new NotFoundException('User not found');

        await this.usersService.update(user.id, { personalEmail: body.email });

        await this.auditService.log(
            user.id,
            'UPDATE_OWN_RECOVERY_EMAIL',
            user.id,
            'User',
            { newEmail: body.email },
            ip
        );

        return { message: 'Recovery email updated successfully' };
    }

    @UseGuards(JwtAuthGuard)
    @Patch('me/fcm-token')
    async updateFcmToken(@Body() body: { fcmToken: string }, @Request() req: any) {
        if (!body.fcmToken) throw new BadRequestException('FCM token required');
        await this.usersService.update(req.user.id, { fcmToken: body.fcmToken });
        return { message: 'FCM token updated' };
    }

    @UseGuards(JwtAuthGuard)
    @Patch('me/phone')
    async updatePhone(@Body() body: { phoneNumber: string }, @Request() req: any) {
        if (!body.phoneNumber) throw new BadRequestException('Phone number required');
        await this.usersService.update(req.user.id, { phoneNumber: body.phoneNumber });
        return { message: 'Phone number updated' };
    }

    @UseGuards(JwtAuthGuard)
    @Put('me/photo')
    @UseInterceptors(
        FileInterceptor('photo', {
            storage: diskStorage({
                destination: (_req, _file, cb) => {
                    const dir = path.join(process.cwd(), 'uploads', 'avatars');
                    fs.mkdirSync(dir, { recursive: true });
                    cb(null, dir);
                },
                filename: (_req, file, cb) => {
                    const ext = path.extname(file.originalname) || '.jpg';
                    cb(null, `avatar_${Date.now()}${ext}`);
                },
            }),
            limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
            fileFilter: (_req, file, cb) => {
                const allowed = ['image/jpeg', 'image/png', 'image/webp'];
                if (!allowed.includes(file.mimetype)) {
                    return cb(new BadRequestException('Only JPEG/PNG/WebP images allowed'), false);
                }
                cb(null, true);
            },
        }),
    )
    async uploadAvatar(@UploadedFile() file: Express.Multer.File, @Request() req: any) {
        if (!file) throw new BadRequestException('Photo file required');
        const avatarUrl = `/uploads/avatars/${file.filename}`;

        // Delete old avatar if it exists
        const user = await this.usersService.findById(req.user.id);
        if (user?.avatarUrl) {
            const oldPath = path.join(process.cwd(), user.avatarUrl.replace(/^\//, ''));
            fs.unlink(oldPath, () => {/* best-effort */});
        }

        await this.usersService.update(req.user.id, { avatarUrl });
        return { avatarUrl };
    }

    @UseGuards(JwtAuthGuard)
    @Delete('me/photo')
    async deleteAvatar(@Request() req: any) {
        const user = await this.usersService.findById(req.user.id);
        if (user?.avatarUrl) {
            const oldPath = path.join(process.cwd(), user.avatarUrl.replace(/^\//, ''));
            fs.unlink(oldPath, () => {/* best-effort */});
        }
        await this.usersService.update(req.user.id, { avatarUrl: null as any });
        return { message: 'Photo supprimée' };
    }

    @UseGuards(JwtAuthGuard)
    @Patch('me/notification-prefs')
    async updateNotifPrefs(
        @Body() body: {
            notifPushPoints?: boolean;
            notifPushLiquidation?: boolean;
            notifSmsPoints?: boolean;
            notifSmsLiquidation?: boolean;
        },
        @Request() req: any,
    ) {
        const allowed = ['notifPushPoints', 'notifPushLiquidation', 'notifSmsPoints', 'notifSmsLiquidation'];
        const update: Record<string, boolean> = {};
        for (const key of allowed) {
            const val = (body as Record<string, boolean | undefined>)[key];
            if (val !== undefined) update[key] = val;
        }
        await this.usersService.update(req.user.id, update);
        return { message: 'Notification preferences updated' };
    }

    /**
     * PATCH /users/me/liquidation-preference
     * Permet à un employé de choisir de conserver ses points lors de la liquidation
     * au lieu de les convertir en DT.
     */
    @UseGuards(JwtAuthGuard)
    @Patch('me/liquidation-preference')
    async updateLiquidationPreference(
        @Body() body: { keepPointsAtLiquidation: boolean },
        @Request() req: any,
    ) {
        if (typeof body.keepPointsAtLiquidation !== 'boolean') {
            throw new BadRequestException('keepPointsAtLiquidation doit être un booléen');
        }
        await this.usersService.update(req.user.id, {
            keepPointsAtLiquidation: body.keepPointsAtLiquidation,
        });
        return {
            message: body.keepPointsAtLiquidation
                ? 'Vos points seront conservés lors de la prochaine liquidation.'
                : 'Vos points seront convertis en DT lors de la prochaine liquidation.',
            keepPointsAtLiquidation: body.keepPointsAtLiquidation,
        };
    }
}
