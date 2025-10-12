import nodemailer from 'nodemailer';

export class SmtpEmailNotifier {
  constructor(cfg) {
    this.transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: cfg.user && cfg.pass ? { user: cfg.user, pass: cfg.pass } : undefined
    });
    this.from = cfg.from;
    this.to = cfg.to;
  }

  async send({ subject, text, html }) {
    await this.transporter.sendMail({
      from: this.from,
      to: this.to,
      subject,
      text,
      html
    });
  }
}
