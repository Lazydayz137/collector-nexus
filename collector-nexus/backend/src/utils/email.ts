import nodemailer from 'nodemailer';
import { createTransport, Transporter } from 'nodemailer';
import { logger } from './logger';
import path from 'path';
import fs from 'fs';
import handlebars from 'handlebars';

// Email configuration interface
interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  from: string;
}

// Email options interface
interface EmailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  template?: string;
  context?: Record<string, any>;
  attachments?: Array<{
    filename: string;
    path: string;
    cid?: string;
  }>;
}

class EmailService {
  private transporter: Transporter;
  private config: EmailConfig;
  private templatesDir: string;

  constructor() {
    this.config = {
      host: process.env.SMTP_HOST || 'smtp.example.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER || 'user@example.com',
        pass: process.env.SMTP_PASS || 'password',
      },
      from: `"${process.env.EMAIL_FROM_NAME || 'Collector\'s Nexus'}" <${
        process.env.EMAIL_FROM || 'noreply@collectorsnexus.com'
      }>`,
    };

    this.transporter = createTransport({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.secure,
      auth: {
        user: this.config.auth.user,
        pass: this.config.auth.pass,
      },
    });

    this.templatesDir = path.join(__dirname, '../../email-templates');

    // Verify connection configuration
    this.verifyConnection();
  }

  
  // Verify SMTP connection
  private async verifyConnection() {
    try {
      await this.transporter.verify();
      logger.info('SMTP server connection verified');
    } catch (error) {
      logger.error('Error connecting to SMTP server:', error);
    }
  }

  // Compile email template
  private async compileTemplate(templateName: string, context: Record<string, any> = {}): Promise<string> {
    try {
      const templatePath = path.join(this.templatesDir, `${templateName}.hbs`);
      const templateContent = await fs.promises.readFile(templatePath, 'utf-8');
      const template = handlebars.compile(templateContent);
      return template({
        ...context,
        year: new Date().getFullYear(),
        appName: 'Collector\'s Nexus',
        appUrl: process.env.APP_URL || 'https://collectorsnexus.com',
      });
    } catch (error) {
      logger.error(`Error compiling email template ${templateName}:`, error);
      throw new Error(`Failed to compile email template: ${templateName}`);
    }
  }

  // Send email
  async sendEmail(options: EmailOptions): Promise<boolean> {
    const { to, subject, text, html, template, context = {}, attachments } = options;

    try {
      let emailHtml = html;
      
      // If template is provided, compile it
      if (template) {
        try {
          emailHtml = await this.compileTemplate(template, context);
        } catch (error) {
          logger.error('Error compiling email template:', error);
          // Continue with text if template compilation fails
          if (!emailHtml && !text) {
            throw new Error('Failed to compile email template and no HTML or text provided');
          }
        }
      }

      const mailOptions = {
        from: this.config.from,
        to: Array.isArray(to) ? to.join(', ') : to,
        subject,
        text,
        html: emailHtml,
        attachments,
      };

      const info = await this.transporter.sendMail(mailOptions);
      logger.info(`Email sent to ${to}: ${info.messageId}`);
      return true;
    } catch (error) {
      logger.error('Error sending email:', error);
      return false;
    }
  }

  // Send welcome email
  async sendWelcomeEmail(to: string, name: string): Promise<boolean> {
    return this.sendEmail({
      to,
      subject: 'Welcome to Collector\'s Nexus!',
      template: 'welcome',
      context: { name },
    });
  }

  // Send password reset email
  async sendPasswordResetEmail(to: string, name: string, resetToken: string): Promise<boolean> {
    const resetUrl = `${process.env.APP_URL}/reset-password?token=${resetToken}`;
    return this.sendEmail({
      to,
      subject: 'Reset Your Password',
      template: 'password-reset',
      context: {
        name,
        resetUrl,
        expiryHours: 1, // Token expiry time in hours
      },
    });
  }

  // Send email verification email
  async sendVerificationEmail(to: string, name: string, verificationToken: string): Promise<boolean> {
    const verificationUrl = `${process.env.APP_URL}/verify-email?token=${verificationToken}`;
    return this.sendEmail({
      to,
      subject: 'Verify Your Email Address',
      template: 'email-verification',
      context: {
        name,
        verificationUrl,
        expiryHours: 24, // Token expiry time in hours
      },
    });
  }

  // Send price alert email
  async sendPriceAlertEmail(
    to: string,
    name: string,
    cardName: string,
    currentPrice: number,
    targetPrice: number,
    cardUrl: string
  ): Promise<boolean> {
    return this.sendEmail({
      to,
      subject: `Price Alert: ${cardName}`,
      template: 'price-alert',
      context: {
        name,
        cardName,
        currentPrice: currentPrice.toFixed(2),
        targetPrice: targetPrice.toFixed(2),
        cardUrl,
      },
    });
  }

  // Send collection summary email
  async sendCollectionSummaryEmail(
    to: string,
    name: string,
    collectionStats: {
      totalCards: number;
      totalValue: number;
      topGainers: Array<{ name: string; change: number }>;
      recentAdditions: Array<{ name: string; date: string }>;
    }
  ): Promise<boolean> {
    return this.sendEmail({
      to,
      subject: 'Your Weekly Collection Summary',
      template: 'collection-summary',
      context: {
        name,
        ...collectionStats,
        totalValue: collectionStats.totalValue.toFixed(2),
      },
    });
  }
}

// Create a singleton instance
export const emailService = new EmailService();

export default emailService;
