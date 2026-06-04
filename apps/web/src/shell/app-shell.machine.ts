import { assign, setup } from 'xstate';
import {
  DEFAULT_PRESET_ID,
  LAYOUT_PRESETS,
  type LayoutPreset,
  type PresetId,
} from './layout-presets';

export const SIDEBAR_VIEWS = ['vessels', 'zones', 'events'] as const;
export type SidebarView = (typeof SIDEBAR_VIEWS)[number];

export const DRAWER_SNAPS = ['hidden', 'peek', 'mid', 'full'] as const;
export type DrawerSnap = (typeof DRAWER_SNAPS)[number];

export type DetailTarget =
  | { readonly kind: 'vessel'; readonly id: number }
  | { readonly kind: 'zone'; readonly id: string }
  | null;

export type AppShellContext = {
  presetId: PresetId;
  sidebarView: SidebarView;
  sidebarCollapsed: boolean;
  detailTarget: DetailTarget;
  drawerSnap: DrawerSnap;
};

export type AppShellEvent =
  | { type: 'preset.swap'; presetId: PresetId }
  | { type: 'sidebar.toggle' }
  | { type: 'sidebar.setView'; view: SidebarView }
  | { type: 'detail.open'; target: NonNullable<DetailTarget> }
  | { type: 'detail.close' }
  | { type: 'drawer.snap'; snap: DrawerSnap };

export type AppShellInput = {
  readonly initialPreset?: PresetId;
};

export const appShellMachine = setup({
  types: {
    context: {} as AppShellContext,
    events: {} as AppShellEvent,
    input: {} as AppShellInput | undefined,
  },
  actions: {
    setPreset: assign({
      presetId: ({ event }) => {
        if (event.type !== 'preset.swap') throw new Error('setPreset: wrong event');
        return event.presetId;
      },
    }),
    toggleSidebar: assign({
      sidebarCollapsed: ({ context }) => !context.sidebarCollapsed,
    }),
    setView: assign({
      sidebarView: ({ event }) => {
        if (event.type !== 'sidebar.setView') throw new Error('setView: wrong event');
        return event.view;
      },
      sidebarCollapsed: () => false,
    }),
    openDetail: assign({
      detailTarget: ({ event }) => {
        if (event.type !== 'detail.open') throw new Error('openDetail: wrong event');
        return event.target;
      },
      presetId: ({ context }) =>
        context.presetId === 'classic' ? 'detail-focus' : context.presetId,
    }),
    closeDetail: assign({
      detailTarget: () => null,
      presetId: ({ context }) =>
        context.presetId === 'detail-focus' ? 'classic' : context.presetId,
    }),
    setDrawerSnap: assign({
      drawerSnap: ({ event }) => {
        if (event.type !== 'drawer.snap') throw new Error('setDrawerSnap: wrong event');
        return event.snap;
      },
      presetId: ({ event, context }) => {
        if (event.type !== 'drawer.snap') return context.presetId;
        if (event.snap === 'mid' || event.snap === 'full') return 'events-focus';
        if (context.presetId === 'events-focus' && event.snap === 'hidden') return 'classic';
        return context.presetId;
      },
    }),
  },
}).createMachine({
  id: 'appShell',
  context: ({ input }) => ({
    presetId: input?.initialPreset ?? DEFAULT_PRESET_ID,
    sidebarView: 'vessels' as const,
    sidebarCollapsed: false,
    detailTarget: null,
    drawerSnap: 'hidden' as const,
  }),
  on: {
    'preset.swap': { actions: 'setPreset' },
    'sidebar.toggle': { actions: 'toggleSidebar' },
    'sidebar.setView': { actions: 'setView' },
    'detail.open': { actions: 'openDetail' },
    'detail.close': { actions: 'closeDetail' },
    'drawer.snap': { actions: 'setDrawerSnap' },
  },
});

export function resolvePreset(presetId: PresetId): LayoutPreset {
  return LAYOUT_PRESETS[presetId];
}
