# worlds.js — integration brief

Drop-in module adding five backdrop worlds, an outer tower shell, and a teleport
transition to the pixelated sorcerer's tower. No dependency on `lair.js` internals.

## Files

- `worlds.js` — the module. This is the only file you need.
- `HANDOFF.md` — full technique notes, gotchas, and perf knobs.

## Install

```js
import { installWorlds } from './worlds.js';

const worlds = installWorlds({
  THREE,          // your three.js namespace
  scene,          // the scene (worlds are added as children)
  camera,         // used by the eye's halo billboard and the x-ray fade
  model,          // the tower group — its materials get patched for the teleport
  fx,             // viewer-only fx group, hidden during a teleport (pass null if none)
  dims: { R: 5.4, FH: 6.2, NF: 6, WH: 5.3, ROT: 102 },
});
```

`dims` must match the tower's real constants: platform radius, floor-to-floor
height, floor count, wall height, and the per-storey rotation in degrees.
`TOP` is derived as `FH * (NF - 1) + WH` unless you pass it.

**Install AFTER your own lighting setup.** `installWorlds` snapshots the scene's
hemisphere and directional lights at install time and treats those values as the
"no world" baseline. Install it too early and every world is lit off the wrong
defaults.

Then call the tick once per frame, before rendering:

```js
worlds.tick(timeInSeconds, deltaInSeconds);
```

## API

| call | does |
|---|---|
| `worlds.set(kind)` | `'seafloor'` \| `'moon'` \| `'forest'` \| `'beach'` \| `'city'` \| `null`. Builds on first use (~150–400 ms), then just toggles visibility, fog, the light rig and the window-glass tint. |
| `worlds.teleport(kind, onSwap?)` | Flash out, run `onSwap(kind)` at the midpoint (default: `set(kind)`), flash in. Returns `false` if one is already running. |
| `worlds.teleporting()` | `true` while a transition plays. |
| `worlds.shell(mode)` | `'off'` \| `'ghost'` \| `'solid'` — the outer stone tower. Built lazily on the first non-off call. |
| `worlds.shellMode()` | current shell mode. |
| `worlds.shellFocus(bool)` | hide the shell while a single storey is on screen. |
| `worlds.wind(v)` | global wind multiplier for grass, kelp and foliage. `0` = still. |
| `worlds.cssFor(kind)` | a hex string matching that world's sky, for your page background. |
| `worlds.current()` | active world kind, or `null`. |
| `worlds.kinds` | `['seafloor', 'moon', 'forest', 'beach', 'city']`. |

Events on `window`: `lair-teleport`, with `detail.kind` and
`detail.phase` = `'out'` \| `'in'` \| `'done'`.

`onSwap` is the hook for a host app that manages its own backdrops — pass a
callback and the teleport plays around whatever you do at the midpoint, instead
of the module's own world switch.

## Route-driven use

If floors map to routes, the natural pairing is one world per section. Teleport
on navigation so the transition covers the world build:

```js
const WORLD_FOR_ROUTE = {
  '/':             'moon',
  '/publications': 'forest',
  '/projects':     'city',
  '/about':        'beach',
  '/archive':      'seafloor',
};

router.afterEach((to) => {
  const kind = WORLD_FOR_ROUTE[to.path] ?? null;
  if (kind !== worlds.current()) worlds.teleport(kind);
});
```

The first `teleport` to a world pays its build cost during the flash, which is
why it doesn't read as a hitch.

## The five worlds

- **`seafloor`** — caustics on sand dunes, three whales on slow arcs, three
  GPU-animated fish schools, kelp, god rays from a wave-lensed surface, bubbles.
- **`moon`** — banded gas giant with ringlets and division gaps low over the
  horizon, ~1,400 stars, a hilltop, ~62k wind-blown grass blades, sparse clouds.
- **`forest`** — 140 instanced trunks, ~4,800 alpha-tested leaf cards, ferns,
  dappled ground, light shafts, a ring of ~1,000 blooms around the base. This is
  the one world with the x-ray fade enabled.
- **`beach`** — straight shoreline, Gerstner sea shoaling on an analytic beach
  profile, sun glitter, a continuous surf line.
- **`city`** — instanced blocks with procedural lit windows, stopped cars,
  cracked asphalt and puddles, working street lamps, and a mechanical eye with a
  dilating pupil and blinking lids patrolling the skyline.

## Performance

Nothing allocates per frame. Every scatter is instanced; the whole shell is about
eight draw calls. If you need headroom, the only heavy numbers are `CN` (forest
canopy cards), `GN` (grass blades, in `moon` and `beach`), and the `school(n, …)`
counts in `seafloor`.

## Two things that will bite

1. **Occluder materials need `uFadeAmt` declared in the vertex header.** It's
   used in the vertex stage. Omit it and the shader fails to compile silently —
   every occluder mesh vanishes, which looks like "all the trees disappeared".
2. **A `PlaneGeometry` rotated `-π/2` about X maps its local `+y` to world `-z`.**
   Sample height profiles with `-getY(i)`. Getting it backwards inverts the
   terrain — that's how the beach ended up sloping into the sea and hiding it.

`HANDOFF.md` has the rest: the shader techniques per world, how the shell's
window table ties to `lair.js`'s `roundWindow()` calls, and how the teleport clip
uniform works.
