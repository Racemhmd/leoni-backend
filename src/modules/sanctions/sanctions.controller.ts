import { Controller, Post, Get, Query, Param, UseGuards, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SanctionsService } from './sanctions.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../database/entities/user.entity';
import { ApiOperation, ApiConsumes, ApiBody, ApiTags, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('sanctions')
@ApiBearerAuth()
@Controller('sanctions')
export class SanctionsController {
  constructor(private readonly sanctionsService: SanctionsService) {}

  @Post('upload')
  @Roles(UserRole.HR_ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Upload and import employee sanction history (HR Admin only)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'CSV or Excel file containing sanction history',
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const allowedMimeTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'text/csv', // .csv
      'application/csv', // .csv (alternative)
    ];

    if (!allowedMimeTypes.includes(file.mimetype) && !file.originalname.match(/\.(xlsx|xls|csv)$/)) {
        throw new BadRequestException('Invalid file type. Only CSV or Excel files are allowed.');
    }

    return this.sanctionsService.importSanctions(file);
  }

  @Get('stats')
  @Roles(UserRole.HR_ADMIN, UserRole.SUPERVISOR)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Get sanction statistics for charts (HR Admin & Supervisor)' })
  async getStats(@Query('period') period?: string, @Query('type') type?: string) {
    return this.sanctionsService.getSanctionStats(period || '6months', type);
  }

  @Get('details')
  @Roles(UserRole.HR_ADMIN, UserRole.SUPERVISOR)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Get sanction details per employee' })
  async getDetails(@Query('period') period?: string, @Query('type') type?: string) {
    return this.sanctionsService.getSanctionDetails(period || '6months', type);
  }

  @Get('employee/:matricule')
  @Roles(UserRole.HR_ADMIN, UserRole.SUPERVISOR)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Get full sanction history for a specific employee' })
  async getEmployeeHistory(@Param('matricule') matricule: string) {
    return this.sanctionsService.getEmployeeSanctionHistory(matricule);
  }

  @Get('kpi-dashboard')
  @Roles(UserRole.HR_ADMIN, UserRole.SUPERVISOR)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Unified KPI dashboard data (Group or Individual)' })
  async getKpiDashboard(@Query('period') period?: string, @Query('matricule') matricule?: string, @Query('group') group?: string) {
    return this.sanctionsService.getKpiDashboardData(period || '6', matricule, group);
  }

  @Get('kpi/group')
  @Roles(UserRole.HR_ADMIN, UserRole.SUPERVISOR)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Get KPIs aggregated by production group' })
  async getKpiByGroup(@Query('period') period?: string, @Query('group') group?: string) {
    return this.sanctionsService.getKpiByGroupData(period || '6', group);
  }

  @Get('kpi/employee/:matricule')
  @Roles(UserRole.HR_ADMIN, UserRole.SUPERVISOR)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({ summary: 'Get KPIs aggregated for a specific employee' })
  async getKpiByEmployee(@Param('matricule') matricule: string, @Query('period') period?: string) {
    return this.sanctionsService.getKpiByEmployee(matricule, period || '6');
  }
}
