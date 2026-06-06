# 3D vessel models

Static assets served at `/models/*.glb` by Vite. Consumed by the
flagship 3D layer (`apps/web/src/modules/map/3d/`).

## Required files

| Filename                | MMSI      | Vessel            | Class     |
| ----------------------- | --------- | ----------------- | --------- |
| `queen-of-szczecin.glb` | 261182777 | QUEEN OF SZCZECIN | Passenger |
| `fairplay-xii.glb`      | 261000536 | FAIRPLAY XII      | Tug       |

The filenames are referenced from
`apps/web/src/modules/map/3d/flagships.config.ts`. If a file is
missing the corresponding ship renders as a flat AIS arrow (deck.gl
`ScenegraphLayer` silently no-ops when the GLB fails to load); the
other flagship and the rest of the map continue to work, so this is
a degrade-not-fail mode.

## Sourcing the models

Pick CC0 or CC-BY low-poly maritime models from Sketchfab. Convert
to GLB if needed (Blender exports natively). Targets:

- File size under ~200 KB each (the chunk budget is generous; lazy
  load keeps initial paint untouched, but every byte still parses).
- Origin at the waterline, +X forward (bow), +Z up.
- Single mesh + texture; complex hierarchies parse slower without
  visible benefit at the map zoom levels operators use.

## Scale calibration

`flagships.config.ts` carries a per-model `scale` multiplier that
gets baked on top of whatever scale the GLB ships with. Tweak in
the config file, never in the layer code. Typical starting point:
8 for a 28 m tug, 12 for a 39 m passenger boat. The right value is
"recognisable at zoom 14, not absurd at zoom 18".
