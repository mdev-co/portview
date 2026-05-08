import { adaptAisStreamMessage } from './ais-stream.adapter';

describe('adaptAisStreamMessage', () => {
  it('decodes a PositionReport into AisMessage type 1', () => {
    const json = JSON.stringify({
      MessageType: 'PositionReport',
      Message: {
        PositionReport: {
          MessageID: 1,
          UserID: 261_345_678,
          NavigationalStatus: 0,
          RateOfTurn: 0,
          Sog: 12.3,
          PositionAccuracy: false,
          Longitude: 14.5528,
          Latitude: 53.4285,
          Cog: 217.4,
          TrueHeading: 215,
          Timestamp: 60,
          SpecialManoeuvreIndicator: 0,
          Raim: false,
          CommunicationState: 1234,
          RepeatIndicator: 0,
        },
      },
      MetaData: { MMSI: 261_345_678 },
    });
    const result = adaptAisStreamMessage(json);
    expect(result.kind).toBe('message');
    if (result.kind !== 'message') return;
    expect(result.value.messageType).toBe(1);
    expect(result.value.mmsi).toBe(261_345_678);
    if (result.value.messageType !== 5) {
      expect(result.value.position).toEqual([14.5528, 53.4285]);
      expect(result.value.speedOverGround).toBe(12.3);
      expect(result.value.courseOverGround).toBe(217.4);
      expect(result.value.trueHeading).toBe(215);
    }
  });

  it('treats sog 102.3 as unknown (null)', () => {
    const json = JSON.stringify({
      Message: {
        PositionReport: {
          UserID: 261_111_111,
          MessageID: 1,
          Longitude: 14.5,
          Latitude: 53.4,
          Sog: 102.3,
        },
      },
    });
    const result = adaptAisStreamMessage(json);
    if (result.kind !== 'message' || result.value.messageType === 5) {
      throw new Error('expected position message');
    }
    expect(result.value.speedOverGround).toBeNull();
  });

  it('treats heading 511 and cog 360 as unknown', () => {
    const json = JSON.stringify({
      Message: {
        PositionReport: {
          UserID: 261_111_111,
          MessageID: 3,
          Longitude: 14.5,
          Latitude: 53.4,
          TrueHeading: 511,
          Cog: 360,
        },
      },
    });
    const result = adaptAisStreamMessage(json);
    if (result.kind !== 'message' || result.value.messageType === 5) {
      throw new Error('expected position message');
    }
    expect(result.value.trueHeading).toBeNull();
    expect(result.value.courseOverGround).toBeNull();
  });

  it('returns null position when latitude is the 91 sentinel', () => {
    const json = JSON.stringify({
      Message: {
        PositionReport: {
          UserID: 261_111_111,
          MessageID: 1,
          Longitude: 14.5,
          Latitude: 91,
        },
      },
    });
    const result = adaptAisStreamMessage(json);
    if (result.kind !== 'message' || result.value.messageType === 5) {
      throw new Error('expected position message');
    }
    expect(result.value.position).toBeNull();
  });

  it('treats rateOfTurn -128 as unknown', () => {
    const json = JSON.stringify({
      Message: {
        PositionReport: {
          UserID: 261_111_111,
          MessageID: 1,
          Longitude: 14.5,
          Latitude: 53.4,
          RateOfTurn: -128,
        },
      },
    });
    const result = adaptAisStreamMessage(json);
    if (result.kind !== 'message') throw new Error('expected message');
    if (result.value.messageType === 5 || result.value.messageType === 18)
      throw new Error('expected class A');
    expect(result.value.rateOfTurn).toBeNull();
  });

  it('decodes a StandardClassBPositionReport into AisMessage type 18', () => {
    const json = JSON.stringify({
      Message: {
        StandardClassBPositionReport: {
          UserID: 261_222_222,
          Sog: 5.5,
          Longitude: 14.6,
          Latitude: 53.5,
          Cog: 90,
          TrueHeading: 91,
          Timestamp: 30,
        },
      },
    });
    const result = adaptAisStreamMessage(json);
    if (result.kind !== 'message') throw new Error('expected message');
    expect(result.value.messageType).toBe(18);
    if (result.value.messageType !== 18) return;
    expect(result.value.position).toEqual([14.6, 53.5]);
    expect(result.value.speedOverGround).toBe(5.5);
  });

  it('decodes a ShipStaticData payload into AisMessage type 5', () => {
    const json = JSON.stringify({
      Message: {
        ShipStaticData: {
          UserID: 261_333_333,
          ImoNumber: 9_074_729,
          Name: 'EXAMPLE',
          CallSign: 'ABC123',
          Type: 70,
          Dimension: { A: 100, B: 50, C: 10, D: 10 },
          FixType: 1,
          Eta: { Month: 6, Day: 15, Hour: 12, Minute: 0 },
          MaximumStaticDraught: 8.5,
          Destination: 'GDANSK',
          Dte: false,
        },
      },
    });
    const result = adaptAisStreamMessage(json);
    if (result.kind !== 'message') throw new Error('expected message');
    expect(result.value.messageType).toBe(5);
    if (result.value.messageType !== 5) return;
    expect(result.value.imo).toBe(9_074_729);
    expect(result.value.vesselName).toBe('EXAMPLE');
    expect(result.value.dimensions).toEqual({
      toBow: 100,
      toStern: 50,
      toPort: 10,
      toStarboard: 10,
    });
    expect(result.value.draught).toBe(8.5);
  });

  it('rejects malformed JSON', () => {
    const result = adaptAisStreamMessage('{ this is not json');
    expect(result.kind).toBe('rejected');
    if (result.kind !== 'rejected') return;
    expect(result.reason.kind).toBe('malformed-json');
  });

  it('rejects payloads with no Message envelope', () => {
    const result = adaptAisStreamMessage(JSON.stringify({ MessageType: 'X' }));
    expect(result.kind).toBe('rejected');
    if (result.kind !== 'rejected') return;
    expect(result.reason.kind).toBe('missing-message');
  });

  it('rejects unsupported payload kinds (e.g. SafetyBroadcast)', () => {
    const json = JSON.stringify({
      MessageType: 'SafetyBroadcast',
      Message: { SafetyBroadcast: { UserID: 1 } },
    });
    const result = adaptAisStreamMessage(json);
    expect(result.kind).toBe('rejected');
    if (result.kind !== 'rejected') return;
    expect(result.reason.kind).toBe('unsupported-payload');
  });

  it('falls back to MetaData.MMSI when payload UserID is missing', () => {
    const json = JSON.stringify({
      Message: {
        PositionReport: {
          MessageID: 1,
          Longitude: 14.5,
          Latitude: 53.4,
        },
      },
      MetaData: { MMSI: 261_999_999 },
    });
    const result = adaptAisStreamMessage(json);
    if (result.kind !== 'message') throw new Error('expected message');
    expect(result.value.mmsi).toBe(261_999_999);
  });
});
