# 09 — Frontend Architecture & Materialize Design System

> Visual styling, SCSS architecture, 5 switchable theme palettes, typography, and micro-motion implementation.

---

## 1. Materialize Design System Blueprint

The frontend adheres strictly to the **Materialize Admin Template** visual language (PIXINVENT Materialize specification), featuring:
- **Card-centric layout**: Flat, subtly elevated cards with `border: 1px solid var(--surface-border)`, border-radius `0.75rem` (`rounded-xl`), and soft ambient drop shadows (`0 4px 18px 0 rgba(47, 43, 61, 0.08)`).
- **Rounded Pill Active Navigation**: In the vertical sidebar, the active route is highlighted by a glowing rounded pill using a diagonal primary gradient:
  ```css
  background: linear-gradient(72.47deg, rgb(var(--color-primary)) 22.16%, rgb(var(--color-primary-hover)) 76.47%);
  box-shadow: 0px 3px 12px 0px rgba(var(--color-primary), 0.45);
  color: #ffffff;
  ```
- **Floating Glassmorphic Navbar**: Elevated top bar with 8px backdrop-filter blur, housing global `CTRL + K` search, Clever Cloud health badge, theme toggle, and profile avatar.

---

## 2. 5 Switchable Theme Palettes & Light/Dark Modes

The theme engine operates dynamically via root CSS variables and HTML data attributes without requiring full page reloads:

| Theme Color | Hex Code | Hover State | Tinted Light BG | Use Case & Brand Alignment |
|---|---|---|---|---|
| **Purple** (Default) | `#7367F0` | `#5E50EE` | `#EAE8FD` | Classic Materialize Primary |
| **Orange** | `#FF9F43` | `#E68A30` | `#FFF0E1` | Materialize Sunset / High-Energy |
| **Cyan / Blue** | `#00CFDD` | `#00B5C2` | `#DDFBFC` | Electric Tech & Telemetry |
| **Green** | `#28C76F` | `#20A35A` | `#DDF7E9` | Verified Consensus & Success |
| **Coral / Red** | `#EA5455` | `#C73839` | `#FCE4E4` | Dialectical Red-Teaming & Invariants |

### Dynamic CSS Variable Architecture
```scss
:root {
  --color-primary: 115 103 240;
  --surface-bg: #f8f7fa;
  --surface-card: #ffffff;
  --surface-sidebar: #ffffff;
  --text-main: #38354d;
  --text-muted: #6e6b7b;
}

.dark {
  --surface-bg: #25293c;
  --surface-card: #2f3349;
  --surface-sidebar: #2b2c40;
  --text-main: #cfcce4;
  --text-muted: #9598b2;
}

[data-theme-color="orange"] {
  --color-primary: 255 159 67;
  --color-primary-hover: 230 138 48;
}
```

---

## 3. Micro-Animations & Motion (`lucide-animated`)

To achieve an interface that feels alive and encourages interaction:
- **`AnimatedIcon` wrapper**: Houses meaningful Lucide icons enhanced with micro-animations on hover (scale, wobble, pulse, rotate).
- **`@keyframes pulseGlow`**: Radiates soft ambient waves around active nodes on the canvas.
- **`@keyframes floatSlow`**: Subtly floats the 3D-styled hero badges on the dashboard.
- **`@keyframes spinSlow`**: Continuous 18s rotation for the floating theme settings gear and background workers.
