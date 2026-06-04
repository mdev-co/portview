export const SLOT_NAMES = [
  'header',
  'activity-bar',
  'sidebar',
  'main',
  'detail',
  'drawer',
] as const;

export type SlotName = (typeof SLOT_NAMES)[number];

export type SlotState = {
  readonly visible: boolean;
};

export type LayoutPreset = {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly gridTemplateAreas: string;
  readonly gridTemplateColumns: string;
  readonly gridTemplateRows: string;
  readonly slots: Readonly<Record<SlotName, SlotState>>;
};

export const LAYOUT_PRESETS = {
  classic: {
    id: 'classic',
    label: 'Classic',
    description: 'Header + main (PR #1 default - matches legacy layout)',
    gridTemplateAreas: `
      "header"
      "main"
    `,
    gridTemplateColumns: '1fr',
    gridTemplateRows: 'auto 1fr',
    slots: {
      header: { visible: true },
      'activity-bar': { visible: false },
      sidebar: { visible: false },
      main: { visible: true },
      detail: { visible: false },
      drawer: { visible: false },
    },
  },
  'operator-ui': {
    id: 'operator-ui',
    label: 'Operator UI',
    description: 'Activity bar + sidebar + main + detail (PR #2 default)',
    gridTemplateAreas: `
      "header header  header header"
      "ab     sidebar main   detail"
      "ab     sidebar drawer detail"
    `,
    gridTemplateColumns: '48px 320px 1fr 0px',
    gridTemplateRows: 'auto 1fr 0px',
    slots: {
      header: { visible: true },
      'activity-bar': { visible: true },
      sidebar: { visible: true },
      main: { visible: true },
      detail: { visible: false },
      drawer: { visible: false },
    },
  },
  'detail-focus': {
    id: 'detail-focus',
    label: 'Detail focus',
    description: 'Sidebar visible + detail panel slid in',
    gridTemplateAreas: `
      "header header  header header"
      "ab     sidebar main   detail"
      "ab     sidebar drawer detail"
    `,
    gridTemplateColumns: '48px 320px 1fr 380px',
    gridTemplateRows: 'auto 1fr 0px',
    slots: {
      header: { visible: true },
      'activity-bar': { visible: true },
      sidebar: { visible: true },
      main: { visible: true },
      detail: { visible: true },
      drawer: { visible: false },
    },
  },
  'events-focus': {
    id: 'events-focus',
    label: 'Events focus',
    description: 'Bottom drawer expanded for event timeline',
    gridTemplateAreas: `
      "header header  header header"
      "ab     sidebar main   detail"
      "ab     drawer  drawer detail"
    `,
    gridTemplateColumns: '48px 320px 1fr 0px',
    gridTemplateRows: 'auto 1fr 40vh',
    slots: {
      header: { visible: true },
      'activity-bar': { visible: true },
      sidebar: { visible: true },
      main: { visible: true },
      detail: { visible: false },
      drawer: { visible: true },
    },
  },
  presentation: {
    id: 'presentation',
    label: 'Presentation',
    description: 'Map only - everything else hidden (3D / demo mode)',
    gridTemplateAreas: `"main main main main"`,
    gridTemplateColumns: '0px 0px 1fr 0px',
    gridTemplateRows: '1fr',
    slots: {
      header: { visible: false },
      'activity-bar': { visible: false },
      sidebar: { visible: false },
      main: { visible: true },
      detail: { visible: false },
      drawer: { visible: false },
    },
  },
} as const satisfies Record<string, LayoutPreset>;

export type PresetId = keyof typeof LAYOUT_PRESETS;

export const DEFAULT_PRESET_ID: PresetId = 'classic';
