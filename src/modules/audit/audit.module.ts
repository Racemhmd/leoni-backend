import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';
import { AuditLog } from '../../database/entities/audit-log.entity';

@Global()
@Module({
    imports: [TypeOrmModule.forFeature([AuditLog])],
    providers: [AuditService],
    controllers: [AuditController],
    exports: [AuditService],
})
export class AuditModule { }
