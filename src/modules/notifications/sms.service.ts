import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../database/entities/user.entity';
import * as https from 'https';

@Injectable()
export class SmsService {
    private readonly logger = new Logger(SmsService.name);

    constructor(
        @InjectRepository(User)
        private readonly usersRepo: Repository<User>,
    ) {}

    /**
     * Send an SMS notification to a single user.
     * Respects the user's per-category opt-in (notifSmsPoints / notifSmsLiquidation).
     * Required env vars: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, SMS_SENDER_ID (or TWILIO_FROM_NUMBER).
     */
    async notifyUser(
        userId: number,
        message: string,
        type: 'points' | 'liquidation' = 'points',
    ): Promise<void> {
        const user = await this.usersRepo.findOne({ where: { id: userId } });
        if (!user?.phoneNumber) return;
        if (type === 'points' && user.notifSmsPoints !== true) return;
        if (type === 'liquidation' && user.notifSmsLiquidation !== true) return;
        await this.sendRaw(user.phoneNumber, message);
    }

    /**
     * Broadcast an SMS to all users who have opted in for the given type.
     */
    async notifyAll(
        message: string,
        type: 'points' | 'liquidation' = 'liquidation',
    ): Promise<void> {
        const users = await this.usersRepo.find({ where: { isActive: true } });
        const targets = users.filter(u => {
            if (!u.phoneNumber) return false;
            return type === 'points' ? u.notifSmsPoints === true : u.notifSmsLiquidation === true;
        });
        await Promise.allSettled(targets.map(u => this.sendRaw(u.phoneNumber!, message)));
    }

    private sendRaw(to: string, message: string): Promise<void> {
        const sid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        const from = process.env.SMS_SENDER_ID ?? process.env.TWILIO_FROM_NUMBER;

        if (!sid || !authToken || !from) {
            this.logger.warn(
                'SMS not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and ' +
                'SMS_SENDER_ID in .env to enable SMS notifications.',
            );
            return Promise.resolve();
        }

        const body = new URLSearchParams({ To: to, From: from, Body: message }).toString();
        const basicAuth = Buffer.from(`${sid}:${authToken}`).toString('base64');

        return new Promise<void>((resolve) => {
            const req = https.request(
                {
                    hostname: 'api.twilio.com',
                    path: `/2010-04-01/Accounts/${sid}/Messages.json`,
                    method: 'POST',
                    headers: {
                        Authorization: `Basic ${basicAuth}`,
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Content-Length': Buffer.byteLength(body),
                    },
                },
                (res) => {
                    let data = '';
                    res.on('data', (chunk: string) => (data += chunk));
                    res.on('end', () => {
                        if (res.statusCode && res.statusCode >= 400) {
                            this.logger.warn(`SMS to ${to} failed (HTTP ${res.statusCode}): ${data}`);
                        }
                        resolve();
                    });
                },
            );
            req.on('error', (err: Error) => {
                this.logger.error(`SMS network error to ${to}: ${err.message}`);
                resolve(); // best-effort — never throw
            });
            req.write(body);
            req.end();
        });
    }
}
