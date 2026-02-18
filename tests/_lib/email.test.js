/**
 * Tests for api/_lib/email.js
 *
 * Tests sendEmail and buildDailyDigest functions.
 * Also tests escapeHtml indirectly through buildDailyDigest.
 */

jest.mock('nodemailer', () => {
  const sendMailMock = jest.fn().mockResolvedValue({ messageId: 'test-id' });
  return {
    createTransport: jest.fn().mockReturnValue({ sendMail: sendMailMock }),
    __sendMailMock: sendMailMock,
  };
});

const nodemailer = require('nodemailer');
const { sendEmail, buildDailyDigest } = require('../../api/_lib/email');

describe('email module', () => {
  describe('sendEmail', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should return true on successful send', async () => {
      const result = await sendEmail({
        to: 'test@example.com',
        subject: 'Test Subject',
        html: '<p>Test</p>',
      });

      expect(result).toBe(true);
      expect(nodemailer.__sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: 'Test Subject',
          html: '<p>Test</p>',
        }),
      );
    });

    it('should include text when text param is provided', async () => {
      await sendEmail({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>HTML</p>',
        text: 'Plain text',
      });

      expect(nodemailer.__sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          html: '<p>HTML</p>',
          text: 'Plain text',
        }),
      );
    });

    it('should not include text when text param is omitted', async () => {
      await sendEmail({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>HTML only</p>',
      });

      const callArgs = nodemailer.__sendMailMock.mock.calls[0][0];
      expect(callArgs.text).toBeUndefined();
    });

    it('should return false on SMTP error', async () => {
      nodemailer.__sendMailMock.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await sendEmail({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      });

      expect(result).toBe(false);
    });

    it('should log SMTP-specific error properties (responseCode, command)', async () => {
      const smtpError = new Error('RCPT TO failed');
      smtpError.responseCode = 550;
      smtpError.command = 'RCPT TO';
      nodemailer.__sendMailMock.mockRejectedValueOnce(smtpError);
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await sendEmail({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      });

      expect(consoleSpy).toHaveBeenCalledWith('SMTP error:', 'RCPT TO failed', 550, 'RCPT TO');
      consoleSpy.mockRestore();
    });

    it('should set from with name and address', async () => {
      await sendEmail({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      });

      const callArgs = nodemailer.__sendMailMock.mock.calls[0][0];
      expect(callArgs.from).toEqual(
        expect.objectContaining({
          name: 'WinningBet',
        }),
      );
    });
  });

  describe('buildDailyDigest', () => {
    it('should return object with subject, html, and text', () => {
      const tips = [
        {
          home_team: 'Milan',
          away_team: 'Inter',
          prediction: '1',
          odds: 1.85,
          confidence: 75,
        },
      ];

      const digest = buildDailyDigest(tips);

      expect(digest).toHaveProperty('subject');
      expect(digest).toHaveProperty('html');
      expect(digest).toHaveProperty('text');
      expect(typeof digest.subject).toBe('string');
      expect(typeof digest.html).toBe('string');
      expect(typeof digest.text).toBe('string');
    });

    it('should include "Tips del" and "WinningBet" in subject', () => {
      const tips = [
        {
          home_team: 'Milan',
          away_team: 'Inter',
          prediction: '1',
          odds: 1.85,
          confidence: 75,
        },
      ];

      const digest = buildDailyDigest(tips);

      expect(digest.subject).toContain('Tips del');
      expect(digest.subject).toContain('WinningBet');
    });

    it('should escape special HTML characters in team names', () => {
      const tips = [
        {
          home_team: 'Team & Co',
          away_team: 'Club <United>',
          prediction: 'X',
          odds: 2.5,
          confidence: 80,
        },
      ];

      const digest = buildDailyDigest(tips);

      expect(digest.html).toContain('Team &amp; Co');
      expect(digest.html).toContain('Club &lt;United&gt;');
      expect(digest.html).not.toContain('Team & Co');
      expect(digest.html).not.toContain('Club <United>');
    });

    it('should include all tips formatted in text version', () => {
      const tips = [
        {
          home_team: 'Milan',
          away_team: 'Inter',
          prediction: '1',
          odds: 1.85,
          confidence: 75,
        },
        {
          home_team: 'Napoli',
          away_team: 'Roma',
          prediction: 'Over 2.5',
          odds: 1.95,
          confidence: 80,
        },
      ];

      const digest = buildDailyDigest(tips);

      expect(digest.text).toContain('Milan vs Inter');
      expect(digest.text).toContain('1 @ 1.85 (75%)');
      expect(digest.text).toContain('Napoli vs Roma');
      expect(digest.text).toContain('Over 2.5 @ 1.95 (80%)');
    });

    it('should return valid structure with empty tips array', () => {
      const tips = [];
      const digest = buildDailyDigest(tips);

      expect(digest).toHaveProperty('subject');
      expect(digest).toHaveProperty('html');
      expect(digest).toHaveProperty('text');
      expect(digest.subject).toContain('Tips del');
      expect(digest.html).toContain('WinningBet');
      expect(digest.text).toContain('Tips del');
    });

    it('should escape quotes and apostrophes in HTML', () => {
      const tips = [
        {
          home_team: 'Team "Best"',
          away_team: "Team 'Winner'",
          prediction: '1',
          odds: 2.0,
          confidence: 70,
        },
      ];

      const digest = buildDailyDigest(tips);

      expect(digest.html).toContain('&quot;');
      expect(digest.html).toContain('&#39;');
    });

    it('should format odds to 2 decimal places', () => {
      const tips = [
        {
          home_team: 'Milan',
          away_team: 'Inter',
          prediction: '1',
          odds: 1.8,
          confidence: 75,
        },
      ];

      const digest = buildDailyDigest(tips);

      expect(digest.html).toContain('1.80');
      expect(digest.text).toContain('1.80');
    });

    it('should handle missing odds gracefully', () => {
      const tips = [
        {
          home_team: 'Milan',
          away_team: 'Inter',
          prediction: '1',
          odds: null,
          confidence: 75,
        },
      ];

      const digest = buildDailyDigest(tips);

      expect(digest.html).toContain('—');
      expect(digest.text).toContain('—');
    });
  });
});
