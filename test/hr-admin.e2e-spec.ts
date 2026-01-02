import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { UsersService } from '../src/modules/users/users.service';
import * as bcrypt from 'bcryptjs';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Role } from '../src/database/entities/role.entity';
import { DataSource, Repository } from 'typeorm';
import { AuthService } from '../src/modules/auth/auth.service';
import { JwtService } from '@nestjs/jwt';

describe('HR Admin Validation (e2e)', () => {
    let app: INestApplication;
    let usersService: UsersService;
    let authService: AuthService;
    let roleRepository: Repository<Role>;
    let jwtService: JwtService;
    let dataSource: DataSource;

    // Increase timeout for DB connection
    jest.setTimeout(30000);

    // Credentials (Explicit)
    const hrCreds = { matricule: 'TEST_HR_9999', password: 'password123', fullName: 'Test HR' };
    const supervisorCreds = { matricule: 'TEST_SUP_9999', password: 'password123', fullName: 'Test Supervisor' };
    const employeeCreds = { matricule: 'TEST_EMP_9999', password: 'password123', fullName: 'Test Employee' };

    let hrToken: string;
    let supervisorToken: string;
    let employeeToken: string;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        await app.init();

        dataSource = app.get<DataSource>(DataSource);
        usersService = app.get<UsersService>(UsersService);
        authService = app.get<AuthService>(AuthService);
        roleRepository = app.get<Repository<Role>>(getRepositoryToken(Role));
        jwtService = app.get<JwtService>(JwtService);

        // Sync Database (Schema Update)
        await dataSource.synchronize(true); // true = drop schema and recreate

        // Ensure Roles Exist
        const ensureRole = async (name: string) => {
            let role = await roleRepository.findOne({ where: { name } });
            if (!role) {
                role = roleRepository.create({ name, description: `Test ${name}` });
                await roleRepository.save(role);
            }
            return role;
        };

        const hrRole = await ensureRole('HR_ADMIN');
        const supRole = await ensureRole('SUPERVISOR');
        const empRole = await ensureRole('EMPLOYEE');


        // Helper to seed/reset user
        const seedUser = async (creds: any, role: Role) => {
            const hashedPassword = await bcrypt.hash(creds.password, 10);

            return await usersService.create({
                matricule: creds.matricule,
                fullName: creds.fullName,
                password: hashedPassword,
                role: role,
                isActive: true,
                mustChangePassword: false,
                pointsBalance: 0,
                failedLoginAttempts: 0
            });
        };

        const hrUser = await seedUser(hrCreds, hrRole);
        const supUser = await seedUser(supervisorCreds, supRole);
        const empUser = await seedUser(employeeCreds, empRole);

        // Manual Token Generation (Bypassing Login Endpoint which has environment issues in test)
        const generateToken = (user: any, roleName: string) => {
            const payload = {
                username: user.matricule,
                matricule: user.matricule,
                sub: user.id,
                role: roleName,
                full_name: user.fullName,
                mustChangePassword: user.mustChangePassword
            };
            return jwtService.sign(payload);
        };

        hrToken = generateToken(hrUser, 'HR_ADMIN');
        supervisorToken = generateToken(supUser, 'SUPERVISOR');
        employeeToken = generateToken(empUser, 'EMPLOYEE');

        console.log('Test Tokens Generated Successfully');
    });

    afterAll(async () => {
        await app.close();
    });

    describe('RBAC: Unauthorized Access Tests', () => {
        it('Employee cannot access Admin Stats', () => {
            return request(app.getHttpServer())
                .get('/dashboard/admin/stats')
                .set('Authorization', `Bearer ${employeeToken}`)
                .expect(403);
        });

        it('Supervisor cannot access Admin Stats', () => {
            return request(app.getHttpServer())
                .get('/dashboard/admin/stats')
                .set('Authorization', `Bearer ${supervisorToken}`)
                .expect(403);
        });

        it('Employee cannot view all users', () => {
            return request(app.getHttpServer())
                .get('/users')
                .set('Authorization', `Bearer ${employeeToken}`)
                .expect(403);
        });

        it('Employee cannot modify points', () => {
            return request(app.getHttpServer())
                .patch(`/users/${employeeCreds.matricule}/points`)
                .set('Authorization', `Bearer ${employeeToken}`)
                .send({ points: 10, type: 'MANUAL_ADJUST', description: 'Hacking attempt' })
                .expect(403);
        });
    });

    describe('RBAC: Supervisor Access', () => {
        it('Supervisor can access /users (restricted view)', () => {
            return request(app.getHttpServer())
                .get('/users')
                .set('Authorization', `Bearer ${supervisorToken}`)
                .expect(200);
        });
    });

    describe('HR Admin Capabilities', () => {
        it('HR Admin can access Admin Stats', async () => {
            const res = await request(app.getHttpServer())
                .get('/dashboard/admin/stats')
                .set('Authorization', `Bearer ${hrToken}`)
                .expect(200);

            expect(res.body).toHaveProperty('totalEmployees');
            expect(res.body).toHaveProperty('totalPoints');
        });

        it('HR Admin can view all users', () => {
            return request(app.getHttpServer())
                .get('/users')
                .set('Authorization', `Bearer ${hrToken}`)
                .expect(200);
        });
    });

    describe('Points Modification & Audit Logs', () => {
        it('HR Admin can add points to Employee', async () => {
            await request(app.getHttpServer())
                .patch(`/users/${employeeCreds.matricule}/points`)
                .set('Authorization', `Bearer ${hrToken}`)
                .send({ points: 10, type: 'MANUAL_ADJUST', description: 'Test Adjustment' })
                .expect(200);
        });

        it('Audit Log is created for point adjustment', async () => {
            const res = await request(app.getHttpServer())
                .get('/audit?limit=5')
                .set('Authorization', `Bearer ${hrToken}`)
                .expect(200);

            const logs = res.body;
            expect(Array.isArray(logs)).toBe(true);
            const adjustmentLog = logs.find((l: any) => l.action === 'ADJUST_POINTS' && l.details.includes('Test Adjustment'));
            expect(adjustmentLog).toBeDefined();
            expect(adjustmentLog.performerMatricule).toBe(hrCreds.matricule);
        });
    });
});
