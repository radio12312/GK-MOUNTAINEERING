import type { GearIcon } from '../config';

/**
 * Inner markup for 24×24 line icons. The wrapping <svg> (in gear.ts) sets
 * stroke="currentColor", stroke-width 1.5, round caps/joins and fill="none".
 */
export const gearIcons: Record<GearIcon, string> = {
  // Side view: frame, three downward points, angled front points, binding strap.
  crampons:
    '<path d="M3 11.5h13.5c1.7 0 3.1.9 3.8 2.3"/><path d="M4.5 11.5l1 4.5 1-4.5M9.5 11.5l1 4.5 1-4.5M14.5 11.5l1 4.5 1-4.5"/><path d="M20.3 13.8l1.7 3.2M18.4 12.6l.9 3.4"/><path d="M5.5 11.5C5.5 8.7 7.8 7 11 7s5.5 1.7 5.5 4.5"/>',

  // Straight shaft, tapered pick drooping right, square adze left, spike at the foot.
  axe:
    '<path d="M12 4.5V20.5l-1 1.5"/><path d="M12 4.5h5c2 0 3.6 1.6 4 4.5-1.3-1.6-2.8-2.5-4.5-2.5H12"/><path d="M12 4.5H6.5v2H12"/><path d="M6.5 3.5v4"/>',

  // Waist belt, belay loop, two leg loops.
  harness:
    '<path d="M3.5 6.5c5.5 2.7 11.5 2.7 17 0l-1 3c-5 2.3-10 2.3-15 0z"/><path d="M12 11.2v1.6"/><circle cx="12" cy="14" r="1.2"/><ellipse cx="7.5" cy="17.5" rx="3.5" ry="2.5"/><ellipse cx="16.5" cy="17.5" rx="3.5" ry="2.5"/>',

  // Dome, brim, two ribs, chin strap.
  helmet:
    '<path d="M3.5 14.5a8.5 8.5 0 0 1 17 0"/><path d="M2.5 14.5h19"/><path d="M9.5 6.6c-.8 2.2-1 5-.7 7.9M14.5 6.6c.8 2.2 1 5 .7 7.9"/><path d="M6 14.5c.6 2.7 2.8 4.5 6 4.5s5.4-1.8 6-4.5"/>',

  // Fixed rope, top hook, spine, grip loop, toothed cam.
  ascender:
    '<path d="M16.5 2v20"/><path d="M8 20.5V5.5a2 2 0 0 1 2-2h7.5v2.5"/><path d="M8 11.5h3a3 3 0 0 1 3 3V19a1.5 1.5 0 0 1-1.5 1.5H8"/><circle cx="14.2" cy="8" r="1.4"/>',

  // Oval body open at the gate, screw-lock sleeve.
  carabiner:
    '<path d="M7 9V7.5a5 5 0 0 1 10 0v9a5 5 0 0 1-10 0V16"/><path d="M7 9v3"/><rect x="5.6" y="12" width="2.8" height="4" rx=".8"/>',

  // One-piece suit: arms out, legs, centre zip, quilting line.
  downsuit:
    '<path d="M9 3h6l3 2.5 3 6.5-2.5 1-2.5-4.5V13l.8 8H14l-2-7-2 7H7.2L8 13V8.5L5.5 13 3 12l3-6.5z"/><path d="M12 3v9"/><path d="M8 10.5h8"/>',

  // High-cuff boot in profile, integrated gaiter line, thick sole.
  boots:
    '<path d="M6.5 3h6v8l5.8 2.2A2.8 2.8 0 0 1 20 15.8V18H4v-3.5l2.5-2.5z"/><path d="M3.5 21h17"/><path d="M4 18v3M20 18v3"/><path d="M6.5 11h6M9.5 5.5h3M9.5 8h3"/>',

  // Mitten with thumb, cuff.
  mitts:
    '<path d="M7.5 15.5V7a3.5 3.5 0 0 1 7 0v3.2l1.4-1.3a1.8 1.8 0 0 1 2.5 2.6L15 15.5"/><rect x="6.5" y="15.5" width="9.5" height="5.5" rx="1"/>',

  // Long-sleeve top with a quarter zip and an under-layer hem.
  layers:
    '<path d="M9 3.5 5 5.5 2.5 12l2.5 1 2-3.5V21h10V9.5l2 3.5 2.5-1L19 5.5l-4-2c-.4 1.4-1.6 2.3-3 2.3s-2.6-.9-3-2.3z"/><path d="M12 5.8V10"/><path d="M7 18h10"/>',

  // Single-lens goggles with nose bridge and strap stubs.
  goggles:
    '<path d="M4 9.5C4 8.1 5.1 7 6.5 7h11C18.9 7 20 8.1 20 9.5v3c0 1.9-1.6 3.5-3.5 3.5-1.3 0-2.4-.7-3-1.8l-.6-1.1a1 1 0 0 0-1.8 0l-.6 1.1c-.6 1.1-1.7 1.8-3 1.8C5.6 16 4 14.4 4 12.5z"/><path d="M1.5 11H4M20 11h2.5"/>',

  // Hooded head with face opening and neck ribbing.
  balaclava:
    '<path d="M12 2.5c-3.9 0-6.5 3-6.5 7v5.5c0 3.7 2.8 6.5 6.5 6.5s6.5-2.8 6.5-6.5V9.5c0-4-2.6-7-6.5-7z"/><path d="M8.5 10.5c0-1.1.9-2 2-2h3c1.1 0 2 .9 2 2V13c0 .8-.7 1.5-1.5 1.5h-4c-.8 0-1.5-.7-1.5-1.5z"/><path d="M8.5 18.5c1.1.6 2.3.9 3.5.9s2.4-.3 3.5-.9"/>',

  // Mummy bag with hood opening and baffles.
  sleepingbag:
    '<path d="M12 2.5c3.3 0 5.5 2.5 5.5 5.5 0 4-1 8.5-2 12a1.5 1.5 0 0 1-1.4 1.5H9.9a1.5 1.5 0 0 1-1.4-1.5c-1-3.5-2-8-2-12 0-3 2.2-5.5 5.5-5.5z"/><ellipse cx="12" cy="7" rx="2.8" ry="2.2"/><path d="M8 12.5h8M8.7 16.5h6.6"/>',

  // Head strap, lamp housing, three beams.
  headlamp:
    '<path d="M14.5 10.6A6.5 4.5 0 1 0 14.5 15.4"/><rect x="14.5" y="10" width="4.5" height="6" rx="1.2"/><path d="M21 10.5l1.5-1M21.3 13h1.7M21 15.5l1.5 1"/>',

  // Cup-lid flask with two bands.
  thermos:
    '<rect x="8.5" y="2.5" width="7" height="2.5" rx=".8"/><path d="M9.5 5v1.5M14.5 5v1.5"/><rect x="7.5" y="6.5" width="9" height="15" rx="2"/><path d="M7.5 10.5h9M7.5 17.5h9"/>',

  // Rolled mat: body, rolled end with inner turn, two straps.
  mat:
    '<path d="M6 7.5h12M6 16.5h12"/><ellipse cx="18" cy="12" rx="2.5" ry="4.5"/><ellipse cx="18" cy="12" rx="1" ry="2"/><path d="M6 7.5a2.5 4.5 0 0 0 0 9"/><path d="M10 7.5a2.5 4.5 0 0 1 0 9M13.5 7.5a2.5 4.5 0 0 1 0 9"/>',

  // Hanging stove: hook, three cords, pot, flame.
  stove:
    '<path d="M12 1.5v3"/><path d="M12 4.5 6 9.5M12 4.5l6 5M12 4.5v5"/><path d="M5 9.5h14"/><path d="M6 9.5v5a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3v-5"/><path d="M12 22.5c-1 0-1.7-.7-1.7-1.6 0-1.1 1.7-2.2 1.7-2.2s1.7 1.1 1.7 2.2c0 .9-.7 1.6-1.7 1.6z"/>',

  // Power bank: cell, terminal, charge bolt.
  battery:
    '<rect x="2.5" y="7" width="17" height="10" rx="2"/><path d="M22 10.5v3"/><path d="M12 9l-2.5 3.3h4L11 15"/>',
};
