import { describe, expect, it } from 'vitest';
import { AivdmParseError, parseAivdmEnvelope } from '../aivdm-envelope';

describe('parseAivdmEnvelope', () => {
  it('parses a single-fragment AIVDM sentence', () => {
    const envelope = parseAivdmEnvelope('!AIVDM,1,1,,A,15M67FC000G?ufbE`Mg45oRP06hAA,0*44');
    expect(envelope.tag).toBe('AIVDM');
    expect(envelope.fragments).toBe(1);
    expect(envelope.fragmentNum).toBe(1);
    expect(envelope.messageId).toBe('');
    expect(envelope.channel).toBe('A');
    expect(envelope.payload).toBe('15M67FC000G?ufbE`Mg45oRP06hAA');
    expect(envelope.fillBits).toBe(0);
  });

  it('parses a multi-fragment AIVDM sentence with sequence id', () => {
    const envelope = parseAivdmEnvelope('!AIVDM,2,1,3,A,55Mwm`P00001L@?O?B0<5<U<59E:1L4hT,0*4F');
    expect(envelope.fragments).toBe(2);
    expect(envelope.fragmentNum).toBe(1);
    expect(envelope.messageId).toBe('3');
  });

  it('parses an AIVDO (own-vessel) tag', () => {
    const envelope = parseAivdmEnvelope('!AIVDO,1,1,,A,15M67FC000G?ufbE`Mg45oRP06hAA,0*04');
    expect(envelope.tag).toBe('AIVDO');
  });

  it('preserves fillBits from the trailing field', () => {
    const envelope = parseAivdmEnvelope('!AIVDM,2,2,3,A,1@0000000000000,2*1F');
    expect(envelope.fillBits).toBe(2);
  });

  it('throws on empty input', () => {
    expect(() => parseAivdmEnvelope('')).toThrow(AivdmParseError);
    expect(() => parseAivdmEnvelope('   ')).toThrow(AivdmParseError);
  });

  it('throws on missing start delimiter', () => {
    expect(() => parseAivdmEnvelope('AIVDM,1,1,,A,X,0*00')).toThrow(/start delimiter/);
  });

  it('rejects $ start delimiter (AIS strictly uses !)', () => {
    expect(() => parseAivdmEnvelope('$AIVDM,1,1,,A,X,0*00')).toThrow(/start delimiter/);
  });

  it('throws on missing checksum marker', () => {
    expect(() => parseAivdmEnvelope('!AIVDM,1,1,,A,X,0')).toThrow(/checksum marker/);
  });

  it('throws on wrong field count', () => {
    expect(() => parseAivdmEnvelope('!AIVDM,1,1,A,X*00')).toThrow(/expected 7 fields/);
  });

  it('throws on unsupported tag', () => {
    expect(() => parseAivdmEnvelope('!GPGGA,1,1,,A,X,0*00')).toThrow(/unsupported tag/);
  });

  it('throws on invalid fragments count', () => {
    expect(() => parseAivdmEnvelope('!AIVDM,0,1,,A,X,0*00')).toThrow(/fragments/);
    expect(() => parseAivdmEnvelope('!AIVDM,abc,1,,A,X,0*00')).toThrow(/fragments/);
  });

  it('throws on fragment number out of range', () => {
    expect(() => parseAivdmEnvelope('!AIVDM,2,3,,A,X,0*00')).toThrow(/fragment number/);
    expect(() => parseAivdmEnvelope('!AIVDM,2,0,,A,X,0*00')).toThrow(/fragment number/);
  });

  it('throws on invalid fill bits', () => {
    expect(() => parseAivdmEnvelope('!AIVDM,1,1,,A,X,9*00')).toThrow(/fill bits/);
    expect(() => parseAivdmEnvelope('!AIVDM,1,1,,A,X,-1*00')).toThrow(/fill bits/);
  });
});
