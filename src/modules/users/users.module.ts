import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from '../../database/entities/user.entity';
import { Role } from '../../database/entities/role.entity';

import { PointsModule } from '../points/points.module';

@Module({
  imports: [TypeOrmModule.forFeature([User, Role]), PointsModule],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule { }
