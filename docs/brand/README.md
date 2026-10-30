# Brand

**Logo:** a corner jig — an L-shaped fence holding a square piece in its corner, with an even gap
between them. Amber, on nothing: no tile behind it, so it fills the icon with a small transparent
margin (D-157). Abstract on purpose: next to the name it must not read as a letter (D-082).

| | Jig Dark | Jig Light |
| --- | --- | --- |
| Mark (accent) | `#E0A458` | `#A8641A` |
| Background | transparent | transparent |

- The shapes are defined twice, with the same numbers on a 1024 grid:
  `apps/desktop/scripts/make-icon.mjs` (draws `build/icon.png`, the app and window icon) and
  `apps/desktop/src/renderer/ui/JigLogo.tsx` (the in-app SVG, in the theme's accent and canvas colours).
- One brand colour (amber). Green, yellow, red and blue are status colours (success, warning, danger,
  info), never brand.
