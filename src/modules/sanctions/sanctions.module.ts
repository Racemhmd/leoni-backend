import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SanctionsController } from './sanctions.controller';
import { SanctionsService } from './sanctions.service';
import { EmployeeSanction } from '../../database/entities/sanction-history.entity';
import { User } from '../../database/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([EmployeeSanction, User])],
  controllers: [SanctionsController],
  providers: [SanctionsService],
  exports: [SanctionsService],
})
export class SanctionsModule {}
