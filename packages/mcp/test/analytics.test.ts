import { describe, expect, it } from 'vitest';
import * as analytics from '../src/analytics.js';

describe('analytics (OpenPanel port)', () => {
  it('is off by default and track is a no-op without creds', () => {
    // No OPENPANEL_CLIENT_ID/SECRET in the test env → disabled.
    expect(analytics.isEnabled()).toBe(false);
    expect(analytics.stats().enabled).toBe(false);
    // Must never throw, even with no event loop work scheduled.
    expect(() => analytics.track('mcp_tool_called', { tool: 'x' })).not.toThrow();
    expect(() => analytics.trackTool('penca_whoami', 'ok', 12)).not.toThrow();
    expect(() => analytics.recordJsonRpc({ method: 'initialize' }, {})).not.toThrow();
  });

  it('classifies caller cohorts by origin', () => {
    expect(analytics.classifyClient('https://claude.ai')).toBe('claude.ai');
    expect(analytics.classifyClient('https://chatgpt.com')).toBe('chatgpt.com');
    expect(analytics.classifyClient('https://1930.dev')).toBe('penca');
    expect(analytics.classifyClient('https://example.com')).toBe('other');
    expect(analytics.classifyClient('')).toBe('unknown');
  });

  it('derives a stable 16-hex anonymous device id', () => {
    const a = analytics.deriveDeviceId('https://claude.ai', '1.2.3.4');
    const b = analytics.deriveDeviceId('https://claude.ai', '1.2.3.4');
    const c = analytics.deriveDeviceId('https://claude.ai', '5.6.7.8');
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('buckets durations into coarse bands', () => {
    expect(analytics.bucketDuration(50)).toBe('<100');
    expect(analytics.bucketDuration(250)).toBe('<500');
    expect(analytics.bucketDuration(1500)).toBe('<2000');
    expect(analytics.bucketDuration(9000)).toBe('>=2000');
  });
});
