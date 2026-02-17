/**
 * Jest global setup — runs before all tests
 * Sets environment variables that modules capture at load time
 */

// Set test environment variables
process.env.CRON_SECRET = 'test-cron-secret';
process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';
process.env.TELEGRAM_PUBLIC_CHANNEL_ID = '-100test_public';
process.env.TELEGRAM_PRIVATE_CHANNEL_ID = '-100test_private';
process.env.TELEGRAM_BOT_USERNAME = 'testbot';
process.env.SMTP_HOST = 'smtp.test.com';
process.env.SMTP_PORT = '587';
process.env.SMTP_USER = 'test@winningbet.com';
process.env.SMTP_PASS = 'test-password';
process.env.SMTP_FROM = 'test@winningbet.com';
process.env.API_FOOTBALL_KEY = 'test-api-football-key';
process.env.FOOTBALL_DATA_KEY = 'test-football-data-key';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
process.env.SUPABASE_SECRET_KEY = 'test-secret-key';
process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
process.env.STRIPE_SECRET_KEY = 'sk_test_12345';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
process.env.STRIPE_PRO_PRICE_ID = 'price_pro_test';
process.env.STRIPE_VIP_PRICE_ID = 'price_vip_test';

// Suppress console.log/warn/error during tests to keep output clean
// (individual tests can still check console calls via jest.spyOn)
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
