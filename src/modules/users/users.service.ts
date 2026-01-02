import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../database/entities/user.entity';
import { Role } from '../../database/entities/role.entity';
import * as xlsx from 'xlsx';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
    constructor(
        @InjectRepository(User)
        private usersRepository: Repository<User>,
        @InjectRepository(Role)
        private roleRepository: Repository<Role>,
    ) { }

    async findOneByMatricule(matricule: string): Promise<User | null> {
        return this.usersRepository.createQueryBuilder('user')
            .leftJoinAndSelect('user.role', 'role')
            .addSelect('user.password')
            .where('user.matricule = :matricule', { matricule })
            .getOne();
    }

    async findById(id: number): Promise<User | null> {
        return this.usersRepository.findOne({
            where: { id },
            relations: ['role']
        });
    }

    async create(userData: Partial<User>): Promise<User> {
        const newUser = this.usersRepository.create(userData);
        return this.usersRepository.save(newUser);
    }

    async importEmployees(file: Express.Multer.File) {
        const workbook = xlsx.read(file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(sheet);

        const stats = {
            total: data.length,
            imported: 0,
            skipped: 0,
            failed: 0,
            errors: [] as string[],
        };

        const rolesCache = new Map<string, Role>();

        for (const row of data as any[]) {
            try {
                // Expected columns: matricule, full_name, department, plant, role
                const { matricule, full_name, department, plant, role } = row;

                if (!matricule || !full_name) {
                    stats.failed++;
                    stats.errors.push(`Row missing matricule or full_name: ${JSON.stringify(row)}`);
                    continue;
                }

                // convert matricule to string just in case excel treated it as number
                const matriculeStr = String(matricule).trim();

                const existingUser = await this.usersRepository.findOne({ where: { matricule: matriculeStr } });
                if (existingUser) {
                    stats.skipped++;
                    continue; // Skip duplicate matricules
                }

                // Role handling
                let userRole = null;
                // Default to EMPLOYEE unless SUPERVISOR or HR_ADMIN is explicitly specified
                let roleName = 'EMPLOYEE';

                if (role) {
                    const r = String(role).trim().toUpperCase();
                    if (r === 'SUPERVISOR' || r === 'HR_ADMIN') {
                        roleName = r;
                    }
                    // If input is OPERATOR or anything else, valid or invalid, we default to EMPLOYEE
                }

                if (rolesCache.has(roleName)) {
                    userRole = rolesCache.get(roleName);
                } else {
                    userRole = await this.roleRepository.findOne({ where: { name: roleName } });
                    if (!userRole) {
                        // Should not happen if DB is seeded correctly
                        userRole = await this.roleRepository.findOne({ where: { name: 'EMPLOYEE' } });
                    }
                    if (userRole) rolesCache.set(roleName, userRole);
                }

                const hashedPassword = await bcrypt.hash('password123', 10);

                const userData: Partial<User> = {
                    matricule: matriculeStr,
                    fullName: full_name,
                    department: department ? String(department).trim() : undefined,
                    plant: plant ? String(plant).trim() : undefined,
                    role: userRole || undefined,
                    pointsBalance: 0,
                    password: hashedPassword,
                    mustChangePassword: true,
                    isActive: true,
                };

                const newUser = this.usersRepository.create(userData);

                await this.usersRepository.save(newUser);
                stats.imported++;

            } catch (error) {
                stats.failed++;
                stats.errors.push(`Error processing row: ${error.message}`);
            }
        }

        return stats;
    }

    async update(id: number, updateData: Partial<User>): Promise<void> {
        await this.usersRepository.update(id, updateData);
    }

    async logSuccessfulLogin(userId: number) {
        await this.usersRepository.update(userId, {
            failedLoginAttempts: 0,
            lastLoginAt: new Date(),
        });
    }

    async logFailedLogin(matricule: string) {
        const user = await this.findOneByMatricule(matricule);
        if (user) {
            await this.usersRepository.increment({ id: user.id }, 'failedLoginAttempts', 1);
        }
    }
    async findAll(): Promise<User[]> {
        return this.usersRepository.find({
            relations: ['role']
        });
    }

    async findByRole(roleName: string): Promise<User[]> {
        return this.usersRepository.find({
            where: {
                role: {
                    name: roleName
                }
            },
            relations: ['role'],
            order: { fullName: 'ASC' }
        });
    }

    async remove(id: number): Promise<void> {
        await this.usersRepository.delete(id);
    }
}
