import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../database/entities/user.entity';
import { Role } from '../../database/entities/role.entity';
import * as xlsx from 'xlsx';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService implements OnApplicationBootstrap {
    constructor(
        @InjectRepository(User)
        private usersRepository: Repository<User>,
        @InjectRepository(Role)
        private roleRepository: Repository<Role>,
    ) { }

    async onApplicationBootstrap() {
        // Wait a short moment to ensure DB connection and sync is fully complete
        // This is a safety measure against race conditions on slower cloud environments
        await new Promise(resolve => setTimeout(resolve, 3000));

        try {
            await this.seedDatabase();
        } catch (error) {
            console.error('Error during database seeding:', error);
        }
    }

    async seedDatabase() {
        // 1. Seed Roles
        if (await this.roleRepository.count() === 0) {
            console.log('Seeding Roles...');
            const roles = [
                { name: 'EMPLOYEE', description: 'Regular employee with basic access' },
                { name: 'SUPERVISOR', description: 'Team supervisor with approval rights' },
                { name: 'HR_ADMIN', description: 'HR administrator with full access' },
            ];
            await this.roleRepository.save(roles);
            console.log('Roles seeded.');
        }

        // 2. Seed Initial Admin User
        const adminMatricule = '10364838';
        const adminExists = await this.usersRepository.findOne({ where: { matricule: adminMatricule } });

        if (!adminExists) {
            console.log('Seeding Initial Admin User...');
            const hrRole = await this.roleRepository.findOne({ where: { name: 'HR_ADMIN' } });
            const hashedPassword = await bcrypt.hash('password123', 10);

            const adminUser = this.usersRepository.create({
                matricule: adminMatricule,
                fullName: 'Racem Hamdi',
                password: hashedPassword,
                role: hrRole || undefined,
                pointsBalance: 100,
                mustChangePassword: true,
                isActive: true,
                department: 'HR'
            });

            await this.usersRepository.save(adminUser);
            console.log(`Initial Admin User (${adminMatricule}) seeded.`);
        }

        // 3. Seed "Rahma" (Employee)
        const employeeMatricule = '10368447';
        const employeeExists = await this.usersRepository.findOne({ where: { matricule: employeeMatricule } });

        if (!employeeExists) {
            console.log('Seeding Test Employee User (Rahma)...');
            const employeeRole = await this.roleRepository.findOne({ where: { name: 'EMPLOYEE' } });
            const hashedPassword = await bcrypt.hash('password123', 10);

            const employeeUser = this.usersRepository.create({
                matricule: employeeMatricule,
                fullName: 'Rahma',
                password: hashedPassword,
                role: employeeRole || undefined,
                pointsBalance: 150, // Enough points to test consumption
                mustChangePassword: true,
                isActive: true,
                department: 'Production'
            });

            await this.usersRepository.save(employeeUser);
            console.log(`Test Employee User (${employeeMatricule}) seeded.`);
        }

        // 4. Seed Bulk Users from List
        const bulkUsers = [
            { matricule: '10326183', fullName: 'Lafi Marwen', role: 'SUPERVISOR' },
            { matricule: '10345605', fullName: 'Gloulou Mohamed Jaouhar', role: 'SUPERVISOR' },
            { matricule: '10351096', fullName: 'Ayari Hanen', role: 'SUPERVISOR' },
            { matricule: '10354618', fullName: 'Tlili Wala', role: 'SUPERVISOR' },
            { matricule: '10347795', fullName: 'Messaoudi Hedi', role: 'HR_ADMIN' },
            { matricule: '10362264', fullName: 'Mansour Khawla', role: 'HR_ADMIN' },
            { matricule: '10367587', fullName: 'Kortli Zina', role: 'EMPLOYEE' },
            { matricule: '10380831', fullName: 'Sana Hmadi', role: 'EMPLOYEE' },
            { matricule: '10380815', fullName: 'Mazen Ben haj Belgacem', role: 'EMPLOYEE' },
            { matricule: '10380741', fullName: 'Mohamed Salah Barhoumi', role: 'EMPLOYEE' },
            { matricule: '10380736', fullName: 'Ghaith Chatbri', role: 'EMPLOYEE' },
            { matricule: '10380575', fullName: 'Ben Letaief Hosni', role: 'EMPLOYEE' },
            { matricule: '10380569', fullName: 'Hfidhi Nejah', role: 'EMPLOYEE' },
            { matricule: '10380568', fullName: 'Ben Njima Maher', role: 'EMPLOYEE' },
            { matricule: '10319279', fullName: 'Rachad Maher', role: 'EMPLOYEE' },
            { matricule: '10326385', fullName: 'Salhi Nihel', role: 'EMPLOYEE' },
            { matricule: '10110172', fullName: 'Abdelli Chedlia', role: 'EMPLOYEE' },
        ];

        console.log('Seeding Bulk Users...');
        for (const user of bulkUsers) {
            const exists = await this.usersRepository.findOne({ where: { matricule: user.matricule } });
            if (!exists) {
                const role = await this.roleRepository.findOne({ where: { name: user.role } });
                const hashedPassword = await bcrypt.hash('password123', 10);

                const newUser = this.usersRepository.create({
                    matricule: user.matricule,
                    fullName: user.fullName,
                    password: hashedPassword,
                    role: role || undefined,
                    pointsBalance: 0,
                    mustChangePassword: true,
                    isActive: true,
                    department: 'TBD'
                });

                await this.usersRepository.save(newUser);
                console.log(`Seeded user: ${user.fullName} (${user.matricule})`);
            }
        }
        console.log('Bulk seeding complete.');
    }

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

    async countEmployees(): Promise<number> {
        return this.usersRepository.count({
            where: {
                role: {
                    name: 'EMPLOYEE'
                }
            }
        });
    }
}
