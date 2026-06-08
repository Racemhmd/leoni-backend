import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../database/entities/user.entity';

@Injectable()
export class PushService {
    private readonly logger = new Logger(PushService.name);
    private app: any = null;

    constructor(
        @InjectRepository(User)
        private readonly usersRepo: Repository<User>,
    ) {
        this.initFirebase();
    }

    private initFirebase(): void {
        const env = process.env.FIREBASE_SERVICE_ACCOUNT;
        if (!env) {
            this.logger.warn(
                'FIREBASE_SERVICE_ACCOUNT not set — push notifications disabled. ' +
                'Set it to a base64-encoded Firebase service-account JSON to enable FCM.',
            );
            return;
        }
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const admin = require('firebase-admin');
            // Avoid re-initializing if the app already exists (hot-reload / test env)
            const existingApps: string[] = admin.apps.map((a: any) => a.name);
            if (existingApps.includes('motivup')) {
                this.app = admin.app('motivup');
            } else {
                const serviceAccount = JSON.parse(
                    Buffer.from(env, 'base64').toString('utf-8'),
                );
                this.app = admin.initializeApp(
                    { credential: admin.credential.cert(serviceAccount) },
                    'motivup',
                );
            }
            this.logger.log('Firebase Admin SDK initialized');
        } catch (err) {
            this.logger.error('Firebase Admin init failed — push notifications disabled', err);
        }
    }

    /**
     * Send a push notification to a single user.
     * Respects the user's per-category preference (notifPushPoints / notifPushLiquidation).
     */
    async notifyUser(
        userId: number,
        title: string,
        body: string,
        type: 'points' | 'liquidation' = 'points',
    ): Promise<void> {
        if (!this.app) return;
        const user = await this.usersRepo.findOne({ where: { id: userId } });
        if (!user?.fcmToken) return;
        if (type === 'points' && user.notifPushPoints === false) return;
        if (type === 'liquidation' && user.notifPushLiquidation === false) return;
        await this.sendRaw(user.fcmToken, title, body);
    }

    /**
     * Broadcast a push notification to all active users who opted in for the given type.
     */
    async notifyAll(
        title: string,
        body: string,
        type: 'points' | 'liquidation' = 'liquidation',
    ): Promise<void> {
        if (!this.app) return;
        const users = await this.usersRepo.find({ where: { isActive: true } });
        const targets = users.filter(u => {
            if (!u.fcmToken) return false;
            return type === 'points' ? u.notifPushPoints !== false : u.notifPushLiquidation !== false;
        });
        await Promise.allSettled(targets.map(u => this.sendRaw(u.fcmToken!, title, body)));
    }

    private async sendRaw(token: string, title: string, body: string): Promise<void> {
        try {
            await this.app.messaging().send({ token, notification: { title, body } });
        } catch (err: any) {
            // Log but don't throw — push is best-effort
            this.logger.warn(`FCM send failed (token …${token.slice(-6)}): ${err?.message}`);
        }
    }
}
