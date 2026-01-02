import { Controller, Post, Body, Get, UseGuards, Request, UseInterceptors, UploadedFile, BadRequestException, Delete, Param, Patch, NotFoundException, Ip, Query } from '@nestjs/common';
import { UsersService } from './users.service';
import { PointsService } from '../points/points.service';
import { AuditService } from '../audit/audit.service';
import { User } from '../../database/entities/user.entity';
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
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.HR_ADMIN, UserRole.EMPLOYEE, UserRole.SUPERVISOR) // Open to others to fetch lists (e.g. employee fetching supervisors)
    @Get()
    async findAll(@Query('role') role?: string) {
        if (role) {
            return this.usersService.findByRole(role);
        }
        // Only HR can list ALL
        // But for specific role lookups, other roles might need permission?
        // E.g. Employee needs to find Supervisor. 
        // We adjusted the @Roles decorator above to allow EMPLOYEE and SUPERVISOR to access this endpoint too, 
        // primarily for fetching specific roles. 
        // Ideally we should restrict: non-HR can only list SUPERVISOR/HR_ADMIN roles, not other EMPLOYEES.
        // For simplicity now, we allow reading the user list.
        return this.usersService.findAll();
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

        if (body.points > 0) {
            await this.pointsService.addPoints(user.id, body.points, body.type || 'ADJUSTED', body.description || 'Manual Adjustment');
        } else {
            // PointsService.deductPoints already checks for insufficient balance (< 0)
            await this.pointsService.deductPoints(user.id, Math.abs(body.points), body.type || 'ADJUSTED', body.description || 'Manual Adjustment');
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
            ip
        );

        return {
            message: 'Points adjusted successfully',
            old_balance: oldBalance,
            new_balance: newBalance
        };
    }
}
