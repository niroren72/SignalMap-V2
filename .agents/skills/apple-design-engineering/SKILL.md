---
name: apple-design-engineering
description: Apple's fluid motion physics and Emil Kowalski's design engineering craft, translated for the modern web. Covers WWDC interaction principles (interruptible springs, velocity handoff, momentum projection, rubber-banding), micro-interaction polish (custom easing, origin-aware popovers, blur masks, clip-path techniques), performance rules (GPU transforms, WAAPI, @starting-style), typography optical sizing, and mandatory Before/After code review tables.
---

# Apple Design Engineering

## Initial Response

When this skill is first invoked without a specific question or file, respond only with:

> I'm ready to help you build fluid, high-craft interfaces on the web, combining Apple's WWDC interaction principles with Emil Kowalski's design engineering craft.

Do not provide any other information until the user asks a question or shares code.

---

## Review Format (Required)

When reviewing UI code or suggesting improvements, you **MUST** use a markdown table with `Before`, `After`, and `Why` columns. Do **NOT** use loose lists with "Before:" and "After:" lines.

| Before | After | Why |
| :--- | :--- | :--- |
| `transition: all 300ms` | `transition: transform 200ms ease-out` | Specify exact properties; avoid expensive `all`. |
| `transform: scale(0)` | `transform: scale(0.95); opacity: 0` | Nothing in physical reality appears from scale 0. |
| `ease-in` on dropdown | `ease-out` with custom curve | `ease-in` delays the start; `ease-out` gives instant feedback. |
| No `:active` state on button | `transform: scale(0.97)` on `:active` | Buttons must feel physically responsive to the press. |
| `transform-origin: center` on popover | `transform-origin: var(--transform-origin)` | Popovers scale from their trigger; modals stay centered. |

---

## 1. Core Philosophy

### Taste is trained, not innate
Good taste is a trained instinct: the ability to see beyond the obvious and recognize what elevates software. Develop it by studying why the best interfaces feel great, reverse-engineering animations, and inspecting interactions.

### Unseen details compound
Most details users never consciously notice. That is the point. When a feature functions exactly as someone assumes it should, they proceed without a second thought.
> *"All those unseen details combine to produce something that's just stunning, like a thousand barely audible voices all singing in tune."* — Paul Graham

### Beauty is leverage
People select tools based on the overall experience, not just functionality. Good defaults and thoughtful animations are real competitive differentiators.

### The Eight Design Principles (WWDC)
1. **Purpose**: Make with intention; decide what *not* to build.
2. **Agency**: Keep people in control; offer choices and easy undo.
3. **Responsibility**: Act in the user's interest; protect privacy and prevent AI errors.
4. **Familiarity**: Build on metaphors people already know; keep visual affordances consistent.
5. **Flexibility**: Adapt to devices, pointers, and user customization.
6. **Simplicity**: Strip the unnecessary without burying controls; clarity over artificial minimalism.
7. **Craft**: Every spacing, timing, and alignment value is a deliberate choice you can defend.
8. **Delight**: The natural result of getting the other seven right.

---

## 2. The Animation Decision Framework

Before writing any animation code, answer these questions in order:

### 1. Should this animate at all?
| User Frequency | Decision |
| :--- | :--- |
| **100+ times/day** (command palettes, shortcuts, power-user toggles) | **No animation. Ever.** (Raycast has zero toggle animation). |
| **Tens of times/day** (hover effects, list navigation) | Remove or drastically reduce (under 120ms). |
| **Occasional** (modals, drawers, toasts, menus) | Standard animation (150–250ms). |
| **Rare / first-time** (onboarding, milestones, success feedback) | Rich animation and micro-delight allowed. |

**Rule**: **Never animate keyboard-initiated actions.** Users executing shortcuts expect instant execution.

### 2. What is the purpose?
Valid purposes:
- **Spatial consistency**: Toast enters and exits from the same direction.
- **State indication**: Button morphs or shows a clear status change.
- **Feedback**: Button scales down on press, confirming the system registered the input.
- **Preventing jarring changes**: Softening abrupt DOM appearances/disappearances.

### 3. What easing should it use?
- **Entering / Exiting elements**: `ease-out` (starts fast, feels immediately responsive).
- **Moving / Morphing on screen**: `ease-in-out` (natural acceleration/deceleration).
- **Hover / Color change**: `ease`.
- **Constant motion** (spinners, marquees): `linear`.
- **Never use `ease-in` for UI animations**: It delays the initial movement when the user's eye is most focused.

```css
/* Custom high-craft easing curves */
:root {
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
  --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1); /* iOS sheet curve */
}
```

### 4. How fast should it be?
- **Button feedback**: 100–160ms
- **Tooltips, small popovers**: 125–200ms
- **Dropdowns, selects**: 150–250ms
- **Modals, drawers**: 200–350ms
- **Rule**: Keep UI animations strictly **under 300ms**. A 180ms dropdown feels noticeably crisper than a 400ms one.

---

## 3. Response & Direct Manipulation

The moment lag appears, directness falls off a cliff.
- **Respond on pointer-down, not on click/release**: Highlight and scale the button the instant it is pressed.
- **Continuous feedback**: For drags, sliders, or sheets, update the UI 1:1 with pointer position throughout the gesture.
- **Hysteresis**: Use a ~10px threshold before locking a swipe/drag direction.
- **Pointer Capture**: Call `el.setPointerCapture(e.pointerId)` so tracking stays intact even when the pointer strays.

```css
/* Instant press feedback */
.button {
  transition: transform 160ms var(--ease-out);
}
.button:active {
  transform: scale(0.97);
}
```

---

## 4. Fluid Motion, Springs & Physics

> *"An interface feels alive when motion starts from the current on-screen value, inherits the user's velocity, projects momentum forward, and can be grabbed and reversed at any instant."*

### Apple Spring Parameters
Apple replaced traditional mass/stiffness/damping with two designer-friendly parameters:
- **Damping ratio**: `1.0` = critically damped (no overshoot, clean settle). `< 1.0` = under-damped (overshoots/oscillates).
- **Response**: Settle time factor in seconds (lower is snappier).

| Interaction | Damping | Response | Motion/Framer Config |
| :--- | :--- | :--- | :--- |
| **Default UI / Reposition** | `1.0` | `0.4` | `{ type: 'spring', bounce: 0, duration: 0.4 }` |
| **Flick / Throw / Release** | `0.8` | `0.4` | `{ type: 'spring', bounce: 0.2, duration: 0.4 }` |
| **Drawer / Bottom Sheet** | `0.8` | `0.3` | `{ type: 'spring', bounce: 0.15, duration: 0.3 }` |

### Velocity Handoff
Pass the pointer's release velocity as the spring's initial velocity to eliminate the seam between dragging and animating:
```js
// Relative velocity = gestureVelocity / (targetValue - currentValue)
animate(element, { y: targetPosition }, {
  type: 'spring',
  velocity: releaseVelocity,
  bounce: 0.15,
  duration: 0.35,
});
```

### Momentum Projection (Apple Deceleration Equation)
Do not snap to the nearest boundary from the release point. Project the resting position based on velocity:
```js
function project(initialVelocity /* px/s */, decelerationRate = 0.998) {
  return (initialVelocity / 1000) * decelerationRate / (1 - decelerationRate);
}

const projectedEndpoint = currentPosition + project(releaseVelocity);
const target = nearestSnapPoint(projectedEndpoint);
animateSpringTo(target, { velocity: releaseVelocity });
```

### Rubber-Banding at Boundaries
Never hit a hard, rigid wall. Resist progressively past boundaries:
```js
function rubberband(overshoot, dimension, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}
```

### Interruptibility Rules
- **Never lock input during transitions**: Modals closing mid-flight should be re-grabbed immediately.
- **Animate from presentation (live) transform**: Never start from logical target values.
- **Decompose 2D motion**: Animate independent X and Y springs to prevent desyncing.

---

## 5. Component Craft & Micro-Interactions

### Never animate from `scale(0)`
Start entry animations from `scale(0.95)` with `opacity: 0`. Things in the physical world deflated still have form.

### Origin-Aware Popovers
Popovers scale from their trigger button; modals scale from center.
```css
.popover {
  transform-origin: var(--transform-origin);
}
.modal {
  transform-origin: center;
}
```

### Tooltip Chaining
Delay the first tooltip (300ms). Once open, make adjacent tooltips instant:
```css
.tooltip {
  transition: transform 125ms var(--ease-out), opacity 125ms var(--ease-out);
}
.tooltip[data-instant] {
  transition-duration: 0ms;
}
```

### Blur Masking for Complex State Transitions
When swapping content or state, add a subtle `filter: blur(2px)` during the 150ms crossfade to bridge visual discrepancies.

### `clip-path` Precision
Use `clip-path: inset(...)` for tab underline indicators, hold-to-delete fills, and comparison sliders:
```css
/* Hold to delete fill */
.hold-fill {
  clip-path: inset(0 100% 0 0);
  transition: clip-path 200ms var(--ease-out);
}
.button:active .hold-fill {
  clip-path: inset(0 0 0 0);
  transition: clip-path 2s linear; /* deliberate hold */
}
```

### Stagger Animations
Stagger multi-item appearances by 30–60ms per child. Keep total stagger under 250ms so UI never feels stalled.

---

## 6. CSS & Performance Engineering

### Only Animate Compositor Properties
Stick strictly to `transform` and `opacity`. Animating `width`, `height`, `margin`, or `padding` triggers layout reflows and frame drops.

### CSS Variables Inheritance Cost
Updating CSS custom properties on parent containers forces style recalculations down the subtree. Update `transform` directly on the moving element:
```js
// Bad: Forces style recalc across all drawer children
element.style.setProperty('--swipe-offset', `${offset}px`);

// Good: Isolated GPU transform
element.style.transform = `translateY(${offset}px)`;
```

### Framer Motion Hardware Acceleration
Framer Motion shorthand props (`x`, `y`) run on `requestAnimationFrame` on the main thread. When under CPU load, use CSS transforms:
```jsx
// Hardware-accelerated off the main thread:
<motion.div animate={{ transform: "translateX(100px)" }} />
```

### Modern Entry States with `@starting-style`
```css
.toast {
  opacity: 1;
  transform: translateY(0);
  transition: opacity 250ms var(--ease-out), transform 250ms var(--ease-out);

  @starting-style {
    opacity: 0;
    transform: translateY(16px);
  }
}
```

---

## 7. Materials, Depth & Translucency

- **Floating Chrome**: Use `backdrop-filter: blur(20px) saturate(180%)` with a semi-transparent surface (`rgba(255, 255, 255, 0.7)` in light, `rgba(18, 18, 20, 0.75)` in dark).
- **Light Edge Catch**: Add `border-top: 1px solid rgba(255, 255, 255, 0.2)` to capture light like polished glass.
- **Vibrancy**: Over translucent materials, bump text font-weight and contrast slightly; never use washed-out grey text over blur.
- **Scroll Edge Masks**: Use a subtle gradient blur or fade rather than a harsh 1px divider under fixed headers.

---

## 8. Typography & Optical Sizing

- **Size-Specific Tracking**: Large display text demands negative letter-spacing (`-0.02em` to `-0.03em`); small labels demand neutral or slightly positive tracking (`+0.01em`).
- **Inverted Leading**: Large headings use tight line-height (`1.05` to `1.15`); body text needs generous leading (`1.5` to `1.6`).
- **System Typography**: Default to `system-ui, -apple-system, sans-serif` before custom fonts to leverage built-in optical sizing.

---

## 9. Accessibility & Reduced Motion

Always respect vestibular and vision preferences:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
  .sheet, .modal, .toast {
    transform: none !important;
    transition: opacity 150ms ease !important;
  }
}

@media (prefers-reduced-transparency: reduce) {
  .translucent-surface {
    backdrop-filter: none !important;
    background: var(--surface-opaque) !important;
  }
}

@media (hover: hover) and (pointer: fine) {
  .button:hover {
    transform: translateY(-1px);
  }
}
```

---

## 10. The Sonner Principles for Component Architecture

1. **DX First**: Zero-friction insertion (e.g. `<Toaster />` once, `toast()` anywhere).
2. **Superior Defaults**: Ship with exquisite easing, typography, and shadow tokens out of the box.
3. **Handle Edge Cases Invisibly**: Pause timers on hidden tabs; maintain hover during drag; ignore accidental multi-touch.
4. **Cohesion**: Match motion character to brand personality (playful vs crisp utility).

---

## 11. Final Review Checklist

Before approving any UI implementation:

| Check | Requirement |
| :--- | :--- |
| **Properties** | No `transition: all`. Only `transform`, `opacity`, `filter`. |
| **Origin** | Popovers use trigger origin; modals use center. |
| **Entering** | Scale starts at `>= 0.95`, not `0`. |
| **Feedback** | Pressable elements provide immediate `:active` scale (`0.97`). |
| **Duration** | Routine UI transitions strictly `< 300ms`. |
| **Keyboard** | Zero animations on keyboard navigation / shortcut commands. |
| **Touch** | Hover states wrapped in `@media (hover: hover) and (pointer: fine)`. |
| **Reduced Motion** | Non-vestibular cross-fades provided for `prefers-reduced-motion`. |
| **Interruption** | Gesture animations allow mid-flight reversal with velocity inheritance. |
