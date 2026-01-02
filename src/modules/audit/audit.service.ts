import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../../database/entities/audit-log.entity';

@Injectable()
export class AuditService {
    constructor(
        @InjectRepository(AuditLog)
        private auditRepository: Repository<AuditLog>,
    ) { }

    async log(adminId: number, action: string, targetId?: number, targetEntity?: string, details?: Record<string, any>, ipAddress?: string) {
        const log = this.auditRepository.create({
            adminId,
            action,
            targetId,
            targetEntity,
            details: details ? JSON.stringify(details) : undefined,
            ipAddress,
        });
        await this.auditRepository.save(log);
    }
}
