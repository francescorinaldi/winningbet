/**
 * Tests for api/_lib/telegram.js
 *
 * Tests Telegram Bot API client functions:
 * - sendPublicTips
 * - sendPrivateTips
 * - sendDirectMessage
 * - createPrivateInviteLink
 * - removeFromPrivateChannel
 */

const telegram = require('../../api/_lib/telegram');

describe('telegram module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('sendPublicTips', () => {
    it('should filter only free tier tips', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true, result: { message_id: 1 } }),
      });

      const tips = [
        {
          home_team: 'Milan',
          away_team: 'Inter',
          prediction: '1',
          odds: 1.85,
          confidence: 75,
          tier: 'free',
          league: 'serie-a',
        },
        {
          home_team: 'Napoli',
          away_team: 'Roma',
          prediction: 'Over 2.5',
          odds: 1.95,
          confidence: 80,
          tier: 'pro',
          league: 'serie-a',
        },
      ];

      const count = await telegram.sendPublicTips(tips);

      expect(count).toBe(1);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/sendMessage'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const callArgs = global.fetch.mock.calls[0][1];
      const payload = JSON.parse(callArgs.body);
      expect(payload.chat_id).toBe('-100test_public');
    });

    it('should return count of free tips sent', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true, result: { message_id: 1 } }),
      });

      const tips = [
        {
          home_team: 'Milan',
          away_team: 'Inter',
          prediction: '1',
          odds: 1.85,
          confidence: 75,
          tier: 'free',
          league: 'serie-a',
        },
        {
          home_team: 'Juventus',
          away_team: 'Torino',
          prediction: 'X',
          odds: 2.5,
          confidence: 70,
          tier: 'free',
          league: 'serie-a',
        },
      ];

      const count = await telegram.sendPublicTips(tips);
      expect(count).toBe(2);
    });

    it('should return 0 when no free tips', async () => {
      const tips = [
        {
          home_team: 'Napoli',
          away_team: 'Roma',
          prediction: 'Over 2.5',
          odds: 1.95,
          confidence: 80,
          tier: 'pro',
          league: 'serie-a',
        },
      ];

      const count = await telegram.sendPublicTips(tips);
      expect(count).toBe(0);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should return 0 on API error', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: false, description: 'Error' }),
      });

      const tips = [
        {
          home_team: 'Milan',
          away_team: 'Inter',
          prediction: '1',
          odds: 1.85,
          confidence: 75,
          tier: 'free',
          league: 'serie-a',
        },
      ];

      const count = await telegram.sendPublicTips(tips);
      expect(count).toBe(0);
    });
  });

  describe('sendPrivateTips', () => {
    it('should filter tier pro or vip', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve({ ok: true, result: { message_id: 1 } }),
      });

      const tips = [
        {
          home_team: 'Milan',
          away_team: 'Inter',
          prediction: '1',
          odds: 1.85,
          confidence: 75,
          tier: 'free',
          league: 'serie-a',
        },
        {
          home_team: 'Napoli',
          away_team: 'Roma',
          prediction: 'Over 2.5',
          odds: 1.95,
          confidence: 80,
          tier: 'pro',
          league: 'serie-a',
        },
        {
          home_team: 'Juventus',
          away_team: 'Torino',
          prediction: 'X',
          odds: 2.5,
          confidence: 85,
          tier: 'vip',
          league: 'serie-a',
        },
      ];

      const count = await telegram.sendPrivateTips(tips);

      expect(count).toBe(2);
      const callArgs = global.fetch.mock.calls[0][1];
      const payload = JSON.parse(callArgs.body);
      expect(payload.chat_id).toBe('-100test_private');
    });

    it('should return count of premium tips sent', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve({ ok: true, result: { message_id: 1 } }),
      });

      const tips = [
        {
          home_team: 'Napoli',
          away_team: 'Roma',
          prediction: 'Over 2.5',
          odds: 1.95,
          confidence: 80,
          tier: 'pro',
          league: 'serie-a',
        },
        {
          home_team: 'Juventus',
          away_team: 'Torino',
          prediction: 'X',
          odds: 2.5,
          confidence: 85,
          tier: 'vip',
          league: 'serie-a',
        },
      ];

      const count = await telegram.sendPrivateTips(tips);
      expect(count).toBe(2);
    });

    it('should return 0 when no premium tips', async () => {
      const tips = [
        {
          home_team: 'Milan',
          away_team: 'Inter',
          prediction: '1',
          odds: 1.85,
          confidence: 75,
          tier: 'free',
          league: 'serie-a',
        },
      ];

      const count = await telegram.sendPrivateTips(tips);
      expect(count).toBe(0);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should return 0 on API error', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: false, description: 'Error' }),
      });

      const tips = [
        {
          home_team: 'Napoli',
          away_team: 'Roma',
          prediction: 'Over 2.5',
          odds: 1.95,
          confidence: 80,
          tier: 'pro',
          league: 'serie-a',
        },
      ];

      const count = await telegram.sendPrivateTips(tips);
      expect(count).toBe(0);
    });
  });

  describe('sendDirectMessage', () => {
    it('should send message to user ID', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve({ ok: true, result: { message_id: 1 } }),
      });

      const result = await telegram.sendDirectMessage(12345, 'Test message');

      expect(result.ok).toBe(true);
      const callArgs = global.fetch.mock.calls[0][1];
      const payload = JSON.parse(callArgs.body);
      expect(payload.chat_id).toBe('12345');
      expect(payload.text).toBe('Test message');
    });

    it('should throw on API error', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: false, description: 'User not found' }),
      });

      await expect(telegram.sendDirectMessage(12345, 'Test')).rejects.toThrow(
        'Telegram: User not found',
      );
    });
  });

  describe('createPrivateInviteLink', () => {
    it('should call createChatInviteLink with member_limit 1', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({ ok: true, result: { invite_link: 'https://t.me/+test123' } }),
      });

      await telegram.createPrivateInviteLink('Test User');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/createChatInviteLink'),
        expect.objectContaining({
          method: 'POST',
        }),
      );

      const callArgs = global.fetch.mock.calls[0][1];
      const payload = JSON.parse(callArgs.body);
      expect(payload.chat_id).toBe('-100test_private');
      expect(payload.name).toBe('Test User');
      expect(payload.member_limit).toBe(1);
    });

    it('should return invite_link from response', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () =>
          Promise.resolve({ ok: true, result: { invite_link: 'https://t.me/+test456' } }),
      });

      const link = await telegram.createPrivateInviteLink('Test User');
      expect(link).toBe('https://t.me/+test456');
    });
  });

  describe('removeFromPrivateChannel', () => {
    it('should call banChatMember then unbanChatMember', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          json: () => Promise.resolve({ ok: true }),
        })
        .mockResolvedValueOnce({
          json: () => Promise.resolve({ ok: true }),
        });

      await telegram.removeFromPrivateChannel(12345);

      expect(global.fetch).toHaveBeenCalledTimes(2);

      const banCall = global.fetch.mock.calls[0];
      expect(banCall[0]).toContain('/banChatMember');
      const banPayload = JSON.parse(banCall[1].body);
      expect(banPayload.chat_id).toBe('-100test_private');
      expect(banPayload.user_id).toBe(12345);

      const unbanCall = global.fetch.mock.calls[1];
      expect(unbanCall[0]).toContain('/unbanChatMember');
      const unbanPayload = JSON.parse(unbanCall[1].body);
      expect(unbanPayload.chat_id).toBe('-100test_private');
      expect(unbanPayload.user_id).toBe(12345);
      expect(unbanPayload.only_if_banned).toBe(true);
    });

    it('should throw on ban error', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve({ ok: false, description: 'User not found' }),
      });

      await expect(telegram.removeFromPrivateChannel(12345)).rejects.toThrow(
        'Telegram: User not found',
      );
    });
  });

  describe('message formatting', () => {
    it('should group tips by league in digest', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve({ ok: true, result: { message_id: 1 } }),
      });

      const tips = [
        {
          home_team: 'Milan',
          away_team: 'Inter',
          prediction: '1',
          odds: 1.85,
          confidence: 75,
          tier: 'free',
          league: 'serie-a',
        },
        {
          home_team: 'Real Madrid',
          away_team: 'Barcelona',
          prediction: 'X',
          odds: 2.5,
          confidence: 80,
          tier: 'free',
          league: 'la-liga',
        },
      ];

      await telegram.sendPublicTips(tips);

      const callArgs = global.fetch.mock.calls[0][1];
      const payload = JSON.parse(callArgs.body);

      expect(payload.text).toContain('SERIE A');
      expect(payload.text).toContain('LA LIGA');
    });

    it('should include combo odds in digest', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        json: () => Promise.resolve({ ok: true, result: { message_id: 1 } }),
      });

      const tips = [
        {
          home_team: 'Milan',
          away_team: 'Inter',
          prediction: '1',
          odds: 2.0,
          confidence: 75,
          tier: 'free',
          league: 'serie-a',
        },
        {
          home_team: 'Napoli',
          away_team: 'Roma',
          prediction: 'X',
          odds: 3.0,
          confidence: 80,
          tier: 'free',
          league: 'serie-a',
        },
      ];

      await telegram.sendPublicTips(tips);

      const callArgs = global.fetch.mock.calls[0][1];
      const payload = JSON.parse(callArgs.body);

      // Combo odds should be 2.0 * 3.0 = 6.00 (escaped in Markdown as 6\\.00)
      expect(payload.text).toContain('6\\.00');
      expect(payload.text).toContain('2 pronostici');
    });
  });
});
