import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AbsencesService } from './absences.service';
import { AbsencesController } from './absences.controller';
import { Absence } from '../../database/entities/absence.entity';
import { LeaveRequest } from '../../database/entities/leave.entity';
import { PointsModule } from '../points/points.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Absence, LeaveRequest]),
    PointsModule,
  ],
  controllers: [AbsencesController],
  providers: [AbsencesService],
})
export class AbsencesModule { }
