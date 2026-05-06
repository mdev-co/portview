import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AisStreamSource } from '../ais-stream-source';

const TOKEN = 'EXTERNAL_FEED_TOKEN';
const ENDPOINT = 'EXTERNAL_FEED_ENDPOINT';

describe('AisStreamSource', () => {
  const originalToken = process.env[TOKEN];
  const originalEndpoint = process.env[ENDPOINT];

  beforeEach(() => {
    delete process.env[TOKEN];
    delete process.env[ENDPOINT];
  });

  afterEach(() => {
    if (originalToken === undefined) delete process.env[TOKEN];
    else process.env[TOKEN] = originalToken;
    if (originalEndpoint === undefined) delete process.env[ENDPOINT];
    else process.env[ENDPOINT] = originalEndpoint;
  });

  it('throws when token env is missing', () => {
    process.env[ENDPOINT] = 'wss://example/stream';
    expect(() => new AisStreamSource()).toThrow(/EXTERNAL_FEED_TOKEN/);
  });

  it('throws when endpoint env is missing', () => {
    process.env[TOKEN] = 'k';
    expect(() => new AisStreamSource()).toThrow(/EXTERNAL_FEED_ENDPOINT/);
  });

  it('throws on empty token', () => {
    process.env[TOKEN] = '';
    process.env[ENDPOINT] = 'wss://example/stream';
    expect(() => new AisStreamSource()).toThrow(/EXTERNAL_FEED_TOKEN/);
  });

  it('throws on empty endpoint', () => {
    process.env[TOKEN] = 'k';
    process.env[ENDPOINT] = '';
    expect(() => new AisStreamSource()).toThrow(/EXTERNAL_FEED_ENDPOINT/);
  });

  it('accepts both via env', () => {
    process.env[TOKEN] = 'k';
    process.env[ENDPOINT] = 'wss://example/stream';
    expect(() => new AisStreamSource()).not.toThrow();
  });

  it('accepts both via options without env', () => {
    expect(
      () => new AisStreamSource({ token: 'k', endpoint: 'wss://example/stream' }),
    ).not.toThrow();
  });

  it('exposes the configured source id and priority', () => {
    const source = new AisStreamSource({ token: 'k', endpoint: 'wss://example/stream' });
    expect(source.id).toBe('ais-stream');
    expect(source.priority).toBe(3);
  });
});
