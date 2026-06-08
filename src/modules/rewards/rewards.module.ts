import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Reward } from '../../database/entities/reward.entity';
import { RewardsService } from './rewards.service';
import { RewardsController } from './rewards.controller';

@Module({
    imports: [TypeOrmModule.forFeature([Reward])],
    controllers: [RewardsController],
    providers: [RewardsService],
    exports: [RewardsService],
})
export class RewardsModule {}
