import { Injectable, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Reward, RewardCategory } from '../../database/entities/reward.entity';

// Catalogue initial — migré depuis le tableau en mémoire de points.controller
const INITIAL_CATALOG: Partial<Reward>[] = [
    { name: "Bon d'achat 10 DT",    pointsCost: 1,  category: RewardCategory.VOUCHER,   description: 'Valable chez tous les partenaires', isActive: true },
    { name: "Bon d'achat 50 DT",    pointsCost: 5,  category: RewardCategory.VOUCHER,   description: 'Valable chez tous les partenaires', isActive: true },
    { name: "Bon d'achat 100 DT",   pointsCost: 10, category: RewardCategory.VOUCHER,   description: 'Valable chez tous les partenaires', isActive: true },
    { name: 'Ticket cinéma',         pointsCost: 15, category: RewardCategory.LEISURE,   description: 'Entrée standard', isActive: true },
    { name: 'Pack Café',             pointsCost: 5,  category: RewardCategory.FOOD,      description: 'Café + Viennoiserie', isActive: true },
    { name: 'Journée Bien-être',     pointsCost: 20, category: RewardCategory.WELLNESS,  description: 'Accès Spa / Salle de sport', isActive: true },
];

@Injectable()
export class RewardsService implements OnApplicationBootstrap {
    constructor(
        @InjectRepository(Reward)
        private readonly rewardsRepo: Repository<Reward>,
    ) {}

    async onApplicationBootstrap() {
        const count = await this.rewardsRepo.count();
        if (count === 0) {
            await this.rewardsRepo.save(this.rewardsRepo.create(INITIAL_CATALOG as Reward[]));
        }
    }

    findAll(onlyActive = true): Promise<Reward[]> {
        return this.rewardsRepo.find({
            where: onlyActive ? { isActive: true } : {},
            order: { pointsCost: 'ASC' },
        });
    }

    async findOne(id: number): Promise<Reward> {
        const r = await this.rewardsRepo.findOne({ where: { id } });
        if (!r) throw new NotFoundException(`Récompense #${id} introuvable`);
        return r;
    }

    async create(dto: Partial<Reward>): Promise<Reward> {
        return this.rewardsRepo.save(this.rewardsRepo.create(dto));
    }

    async update(id: number, dto: Partial<Reward>): Promise<Reward> {
        await this.findOne(id);
        await this.rewardsRepo.update(id, dto);
        return this.findOne(id);
    }

    async remove(id: number): Promise<void> {
        await this.findOne(id);
        await this.rewardsRepo.delete(id);
    }

    /** Décrémente le stock d'une récompense lors d'un échange. */
    async consumeOne(id: number): Promise<void> {
        const reward = await this.findOne(id);
        if (reward.stock !== null && reward.stock !== undefined) {
            if (reward.stock <= 0) {
                throw new Error(`La récompense "${reward.name}" est en rupture de stock`);
            }
            await this.rewardsRepo.decrement({ id }, 'stock', 1);
        }
    }
}
