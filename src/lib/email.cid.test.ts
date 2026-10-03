import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import nodemailer from 'nodemailer';
import { getLogoAttachment } from '@/lib/email';

describe('nodemailer 10 json-transport CID logo', () => {
  it('builds a password-reset message that includes the CID logo attachment', async () => {
    const logo = getLogoAttachment();
    expect(existsSync(logo.path)).toBe(true);

    const transporter = nodemailer.createTransport({ jsonTransport: true });
    const info = await transporter.sendMail({
      from: 'noreply@example.com',
      to: 'user@example.com',
      subject: 'Password Reset Request - InstradaOGM',
      text: 'Reset your password.',
      html: '<img src="cid:instrada-logo" alt="InstradaOGM" class="logo">',
      attachments: [logo],
    });

    const message = JSON.parse(String(info.message)) as {
      html?: string;
      attachments?: Array<{ filename?: string; cid?: string; content?: string }>;
    };
    expect(message.html).toContain('cid:instrada-logo');
    expect(message.attachments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          filename: 'instrada-logo.png',
          cid: 'instrada-logo',
        }),
      ]),
    );
    expect(message.attachments?.[0]?.content?.length).toBeGreaterThan(0);
  });
});
