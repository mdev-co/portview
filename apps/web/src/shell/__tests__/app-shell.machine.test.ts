import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { appShellMachine } from '../app-shell.machine';

function startActor() {
  const actor = createActor(appShellMachine, { input: undefined });
  actor.start();
  return actor;
}

describe('appShellMachine', () => {
  it('starts in classic preset with vessels view, no detail, drawer hidden', () => {
    const actor = startActor();
    const ctx = actor.getSnapshot().context;
    expect(ctx.presetId).toBe('classic');
    expect(ctx.sidebarView).toBe('vessels');
    expect(ctx.sidebarCollapsed).toBe(false);
    expect(ctx.detailTarget).toBeNull();
    expect(ctx.drawerSnap).toBe('hidden');
  });

  it('preset.swap updates active preset', () => {
    const actor = startActor();
    actor.send({ type: 'preset.swap', presetId: 'presentation' });
    expect(actor.getSnapshot().context.presetId).toBe('presentation');
  });

  it('sidebar.toggle flips collapsed state', () => {
    const actor = startActor();
    actor.send({ type: 'sidebar.toggle' });
    expect(actor.getSnapshot().context.sidebarCollapsed).toBe(true);
    actor.send({ type: 'sidebar.toggle' });
    expect(actor.getSnapshot().context.sidebarCollapsed).toBe(false);
  });

  it('sidebar.setView changes view and uncollapses sidebar', () => {
    const actor = startActor();
    actor.send({ type: 'sidebar.toggle' });
    expect(actor.getSnapshot().context.sidebarCollapsed).toBe(true);
    actor.send({ type: 'sidebar.setView', view: 'zones' });
    expect(actor.getSnapshot().context.sidebarView).toBe('zones');
    expect(actor.getSnapshot().context.sidebarCollapsed).toBe(false);
  });

  it('detail.open swaps classic preset to detail-focus and stores target', () => {
    const actor = startActor();
    actor.send({ type: 'detail.open', target: { kind: 'vessel', id: 261200870 } });
    const ctx = actor.getSnapshot().context;
    expect(ctx.presetId).toBe('detail-focus');
    expect(ctx.detailTarget).toEqual({ kind: 'vessel', id: 261200870 });
  });

  it('detail.close clears target and reverts detail-focus to classic', () => {
    const actor = startActor();
    actor.send({ type: 'detail.open', target: { kind: 'zone', id: 'anchorage-a' } });
    actor.send({ type: 'detail.close' });
    const ctx = actor.getSnapshot().context;
    expect(ctx.detailTarget).toBeNull();
    expect(ctx.presetId).toBe('classic');
  });

  it('detail.close keeps custom preset (non-detail-focus) intact', () => {
    const actor = startActor();
    actor.send({ type: 'preset.swap', presetId: 'events-focus' });
    actor.send({ type: 'detail.open', target: { kind: 'vessel', id: 1 } });
    actor.send({ type: 'detail.close' });
    expect(actor.getSnapshot().context.presetId).toBe('events-focus');
  });

  it('drawer.snap to mid switches preset to events-focus', () => {
    const actor = startActor();
    actor.send({ type: 'drawer.snap', snap: 'mid' });
    const ctx = actor.getSnapshot().context;
    expect(ctx.drawerSnap).toBe('mid');
    expect(ctx.presetId).toBe('events-focus');
  });

  it('drawer.snap to hidden from events-focus returns to classic', () => {
    const actor = startActor();
    actor.send({ type: 'drawer.snap', snap: 'full' });
    actor.send({ type: 'drawer.snap', snap: 'hidden' });
    const ctx = actor.getSnapshot().context;
    expect(ctx.drawerSnap).toBe('hidden');
    expect(ctx.presetId).toBe('classic');
  });

  it('drawer.snap peek does not change preset', () => {
    const actor = startActor();
    actor.send({ type: 'drawer.snap', snap: 'peek' });
    expect(actor.getSnapshot().context.presetId).toBe('classic');
  });
});
