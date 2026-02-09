/**
 * Tests for api/_lib/email.js
 *
 * Tests sendEmail and buildDailyDigest functions.
 * Also tests escapeHtml indirectly through buildDailyDigest.
 */

const { sendEmail, buildDailyDigest } = require('../../api/_lib/email');

describe('email module', () => {
  describe('sendEmail', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should return true on successful send (status 202)', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 202,
        text: () => Promise.resolve(''),
      });

      const result = await sendEmail({
        to: 'test@example.com',
        subject: 'Test Subject',
        html: '<p>Test</p>',
      });

      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.sendgrid.com/v3/mail/send',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer SG.test-key',
            'Content-Type': 'application/json',
          }),
        }),
      );
    });

    it('should include text/plain content when text param is provided', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 202,
        text: () => Promise.resolve(''),
      });

      await sendEmail({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>HTML</p>',
        text: 'Plain text',
      });

      const callArgs = global.fetch.mock.calls[0][1];
      const payload = JSON.parse(callArgs.body);

      expect(payload.content).toHaveLength(2);
      expect(payload.content[0]).toEqual({
        type: 'text/plain',
        value: 'Plain text',
      });
      expect(payload.content[1]).toEqual({
        type: 'text/html',
        value: '<p>HTML</p>',
      });
    });

    it('should only include text/html when text param is omitted', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 202,
        text: () => Promise.resolve(''),
      });

      await sendEmail({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>HTML only</p>',
      });

      const callArgs = global.fetch.mock.calls[0][1];
      const payload = JSON.parse(callArgs.body);

      expect(payload.content).toHaveLength(1);
      expect(payload.content[0]).toEqual({
        type: 'text/html',
        value: '<p>HTML only</p>',
      });
    });

    it('should return false on HTTP error', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Bad Request'),
      });

      const result = await sendEmail({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      });

      expect(result).toBe(false);
    });

    it('should send correct Authorization header with Bearer token', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 202,
        text: () => Promise.resolve(''),
      });

      await sendEmail({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
      });

      const callArgs = global.fetch.mock.calls[0][1];
      expect(callArgs.headers.Authorization).toBe('Bearer SG.test-key');
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
