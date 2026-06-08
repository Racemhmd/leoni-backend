import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum RewardCategory {
    VOUCHER      = 'voucher',
    LEISURE      = 'loisirs',
    FOOD         = 'restauration',
    WELLNESS     = 'bien-etre',
    ELECTRONICS  = 'electronique',
    OTHER        = 'autre',
}

@Entity('rewards')
export class Reward {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ length: 200 })
    name: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({
        type: 'enum',
        enum: RewardCategory,
        default: RewardCategory.OTHER,
    })
    category: RewardCategory;

    @Column({ name: 'points_cost', type: 'decimal', precision: 10, scale: 2 })
    pointsCost: number;

    @Column({ name: 'image_url', nullable: true, length: 512 })
    imageUrl: string;

    @Column({ name: 'is_active', default: true })
    isActive: boolean;

    /** null = stock illimité */
    @Column({ type: 'int', nullable: true })
    stock: number;

    @CreateDateColumn({ name: 'created_at' })
    createdAt: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt: Date;
}
