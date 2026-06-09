import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter;
  private readonly logger = new Logger(EmailService.name);

  constructor() {
    this.logger.log('Initializing Email Service...');
    
    // Check SMTP config
    if (!process.env.EMAIL_HOST || !process.env.EMAIL_PORT || !process.env.EMAIL_USER) {
        this.logger.warn('SMTP configuration missing in .env (EMAIL_HOST, EMAIL_PORT, EMAIL_USER). Email service will not be able to send emails.');
    } else {
        try {
            this.transporter = nodemailer.createTransport({
              host: process.env.EMAIL_HOST,
              port: parseInt(process.env.EMAIL_PORT, 10),
              secure: process.env.EMAIL_SECURE === 'true',
              auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
              }
            });
            this.logger.log(`SMTP Transporter created for host ${process.env.EMAIL_HOST}`);
        } catch (err) {
            this.logger.error('Failed to create SMTP transporter', err);
        }
    }
  }

  async sendPasswordResetEmail(to: string, code: string, expiresInMinutes: number) {
    const subject = 'LEONI - Password Reset Request';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #ddd; border-radius: 8px; padding: 20px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h2 style="color: #004d99; margin: 0;">LEONI</h2>
        </div>
        <p>Hello,</p>
        <p>We received a request to reset your password. Use the verification code below to proceed:</p>
        <div style="text-align: center; margin: 30px 0;">
          <span style="display: inline-block; background-color: #f4f4f4; border: 1px solid #ccc; font-size: 24px; font-weight: bold; padding: 10px 20px; border-radius: 5px; letter-spacing: 2px;">
            ${code}
          </span>
        </div>
        <p>This code will expire in <strong>${expiresInMinutes} minutes</strong>.</p>
        <p style="color: #555; font-size: 14px;">If you did not request a password reset, please ignore this email or contact the HR department if you have concerns.</p>
        <br/>
        <p style="font-size: 12px; color: #aaa; text-align: center;">This is an automated message, please do not reply.</p>
      </div>
    `;

    // Dev fallback: log code to console when SMTP is not configured
    if (!this.transporter) {
      if (process.env.NODE_ENV !== 'production') {
        this.logger.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        this.logger.warn(`[DEV] Reset code for ${to}: ${code}`);
        this.logger.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        return; // Skip actual email in dev
      }
      this.logger.error('Attempted to send email but SMTP is not configured properly.');
      throw new InternalServerErrorException('Email service is not configured correctly.');
    }

    try {
      const fromEmail = process.env.EMAIL_FROM || '"LEONI HR Portal" <noreply@leoni.com>';
      await this.transporter.sendMail({
        from: fromEmail,
        to,
        subject,
        html,
      });
      this.logger.log(`Password reset email sent to ${to}`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}: ${error.message}`, error.stack);
      if (process.env.NODE_ENV !== 'production') {
        this.logger.warn(`[DEV] SMTP failed. Reset code for ${to}: ${code}`);
        return; // Don't crash in dev
      }
      throw new InternalServerErrorException('Email service encountered an error while sending.');
    }
  }
}
