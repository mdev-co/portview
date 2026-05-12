import { NewMmsiBouncer } from './new-mmsi-bouncer';

describe('NewMmsiBouncer', () => {
  let now = 0;
  const clock = () => now;

  beforeEach(() => {
    now = 1_000_000;
  });

  it('admits known MMSIs without spending tokens', () => {
    const bouncer = new NewMmsiBouncer({
      introductionsCapacity: 1,
      introductionsPerSecond: 0.0001,
      now: clock,
    });

    expect(bouncer.admit(261_000_001)).toBe('admitted-new');
    expect(bouncer.admit(261_000_001)).toBe('admitted-known');
    expect(bouncer.admit(261_000_001)).toBe('admitted-known');
  });

  it('rejects new MMSI introductions beyond the bucket', () => {
    const bouncer = new NewMmsiBouncer({
      introductionsCapacity: 2,
      introductionsPerSecond: 0.0001,
      now: clock,
    });

    expect(bouncer.admit(1)).toBe('admitted-new');
    expect(bouncer.admit(2)).toBe('admitted-new');
    expect(bouncer.admit(3)).toBe('rejected-new-cap');
  });

  it('lets new MMSIs in again after refill', () => {
    const bouncer = new NewMmsiBouncer({
      introductionsCapacity: 1,
      introductionsPerSecond: 1,
      now: clock,
    });

    expect(bouncer.admit(1)).toBe('admitted-new');
    expect(bouncer.admit(2)).toBe('rejected-new-cap');
    now += 1_500;
    expect(bouncer.admit(2)).toBe('admitted-new');
  });

  it('evicts least-recently-seen known MMSI at tracked cap', () => {
    const bouncer = new NewMmsiBouncer({
      introductionsCapacity: 100,
      introductionsPerSecond: 100,
      trackedMmsiLimit: 2,
      now: clock,
    });

    bouncer.admit(1);
    bouncer.admit(2);
    bouncer.admit(3);

    // 1 was evicted - admitting it again is a NEW introduction.
    expect(bouncer.admit(1)).toBe('admitted-new');
  });

  it('reports stats', () => {
    const bouncer = new NewMmsiBouncer({
      introductionsCapacity: 1,
      introductionsPerSecond: 0.0001,
      now: clock,
    });

    bouncer.admit(1);
    bouncer.admit(2);
    bouncer.admit(1);

    const stats = bouncer.stats();
    expect(stats.introductionsAdmitted).toBe(1);
    expect(stats.introductionsRejected).toBe(1);
    expect(stats.known).toBe(1);
  });
});
