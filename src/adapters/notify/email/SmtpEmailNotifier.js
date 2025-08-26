import nodemailer from 'nodemailer';
import { AdapterError } from '../../../domain/errors/DomainError.js';

export class SmtpEmailNotifier {
  constructor({ config, logger }) {
    this.config = config;
    this.logger = logger;
    this.transporter = null;
  }

  async _getTransporter() {
    if (!this.transporter) {
      try {
        this.transporter = nodemailer.createTransporter({
          host: this.config.host,
          port: this.config.port,
          secure: this.config.secure,
          auth: {
            user: this.config.user,
            pass: this.config.pass
          },
          connectionTimeout: 60000,
          greetingTimeout: 30000,
          socketTimeout: 60000
        });

        await this.transporter.verify();
        this.logger.info({ host: this.config.host, port: this.config.port }, 'SMTP connection verified');
      } catch (error) {
        this.logger.error({ 
          error: error.message, 
          host: this.config.host, 
          port: this.config.port 
        }, 'Failed to initialize SMTP transporter');
        throw new AdapterError('Failed to initialize SMTP transporter', 'smtp', error);
      }
    }
    return this.transporter;
  }

  async send(message) {
    try {
      if (!message.subject) {
        throw new Error('Email subject is required');
      }

      if (!message.html && !message.text) {
        throw new Error('Email must have either HTML or text content');
      }

      const transporter = await this._getTransporter();

      const mailOptions = {
        from: this.config.from,
        to: this.config.to,
        subject: message.subject,
        text: message.text,
        html: message.html
      };

      this.logger.info({ 
        to: this._maskEmails(this.config.to), 
        subject: message.subject 
      }, 'Sending email notification');

      const info = await transporter.sendMail(mailOptions);

      this.logger.info({ 
        messageId: info.messageId,
        response: info.response 
      }, 'Email sent successfully');

    } catch (error) {
      this.logger.error({ 
        error: error.message,
        to: this._maskEmails(this.config.to)
      }, 'Failed to send email notification');

      if (error.code === 'EAUTH') {
        throw new AdapterError('SMTP authentication failed. Check username and password.', 'smtp', error);
      } else if (error.code === 'ECONNECTION') {
        throw new AdapterError('Could not connect to SMTP server. Check host and port.', 'smtp', error);
      } else if (error.code === 'ETIMEDOUT') {
        throw new AdapterError('SMTP connection timed out. Check network connectivity.', 'smtp', error);
      } else {
        throw new AdapterError('Failed to send email notification', 'smtp', error);
      }
    }
  }

  _maskEmails(emails) {
    if (!emails) return '';
    return emails.replace(/([^@,\s]+)@([^@,\s]+)/g, (match, username, domain) => {
      const maskedUsername = username.length > 2 ? 
        username.slice(0, 2) + '*'.repeat(username.length - 2) : 
        username;
      return `${maskedUsername}@${domain}`;
    });
  }
}