import { beforeEach, describe, expect, it } from 'vitest';
import {
  $activeMapStyle,
  ALL_BASE_LAYER_IDS,
  ALL_OVERLAY_LAYER_IDS,
  DEFAULT_MAP_STYLE,
  MAP_STYLE_IDS,
  MAP_STYLE_REGISTRY,
  isMapStyleId,
  setMapStyle,
} from '../map-style';

describe('map-style state', () => {
  beforeEach(() => {
    $activeMapStyle.set(DEFAULT_MAP_STYLE);
  });

  describe('registry', () => {
    it('declares an entry for every MapStyleId', () => {
      for (const id of MAP_STYLE_IDS) {
        expect(MAP_STYLE_REGISTRY[id]).toBeDefined();
        expect(MAP_STYLE_REGISTRY[id].id).toBe(id);
      }
    });

    it('every base layer id is unique across descriptors', () => {
      const seen = new Set<string>();
      for (const id of MAP_STYLE_IDS) {
        const base = MAP_STYLE_REGISTRY[id].baseLayerId;
        expect(seen.has(base)).toBe(false);
        seen.add(base);
      }
    });

    it('ALL_BASE_LAYER_IDS lists every descriptor base', () => {
      for (const id of MAP_STYLE_IDS) {
        expect(ALL_BASE_LAYER_IDS).toContain(MAP_STYLE_REGISTRY[id].baseLayerId);
      }
    });

    it('every overlay layer id referenced by a descriptor is in ALL_OVERLAY_LAYER_IDS', () => {
      for (const id of MAP_STYLE_IDS) {
        for (const overlay of MAP_STYLE_REGISTRY[id].overlayLayerIds) {
          expect(ALL_OVERLAY_LAYER_IDS as readonly string[]).toContain(overlay);
        }
      }
    });
  });

  describe('$activeMapStyle atom', () => {
    it('defaults to DEFAULT_MAP_STYLE', () => {
      expect($activeMapStyle.get()).toBe(DEFAULT_MAP_STYLE);
    });

    it('setMapStyle writes the new id', () => {
      setMapStyle('tactical');
      expect($activeMapStyle.get()).toBe('tactical');
    });

    it('switching back to default is idempotent', () => {
      setMapStyle('satellite');
      setMapStyle(DEFAULT_MAP_STYLE);
      expect($activeMapStyle.get()).toBe(DEFAULT_MAP_STYLE);
    });
  });

  describe('isMapStyleId guard', () => {
    it('accepts every declared id', () => {
      for (const id of MAP_STYLE_IDS) {
        expect(isMapStyleId(id)).toBe(true);
      }
    });

    it('rejects unknown strings and non-strings', () => {
      expect(isMapStyleId('unknown')).toBe(false);
      expect(isMapStyleId('')).toBe(false);
      expect(isMapStyleId(0)).toBe(false);
      expect(isMapStyleId(null)).toBe(false);
      expect(isMapStyleId(undefined)).toBe(false);
      expect(isMapStyleId({ id: 'nautical' })).toBe(false);
    });
  });
});
