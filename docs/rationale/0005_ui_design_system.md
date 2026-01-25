# ADR-0005: UI Design System - Cyberpunk Pastel Aesthetic

**Status:** Accepted  
**Date:** 2026-01-25  
**Supersedes:** N/A

## Context

Pastel-HN aims to be "the definitive Hacker News desktop experience." To achieve this, we needed a distinctive visual identity that:

1. Differentiates us from the minimalist HN web interface
2. Provides comfortable extended reading sessions
3. Feels native on desktop while maintaining character
4. Supports both dark and light mode preferences
5. Accommodates users with different density and font size needs

### Design Goals

- **Reader-First**: Optimize typography and spacing for comfortable reading
- **Visual Hierarchy**: Clear distinction between stories, comments, and metadata
- **Responsive Feedback**: Immediate, satisfying interaction responses
- **Keyboard-Centric**: Visual indicators for keyboard navigation
- **Beautiful by Default**: Stunning visuals that don't sacrifice usability

## Decision

We implemented a comprehensive "Cyberpunk Pastel" design system with the following components:

### 1. Color Palette

#### Dark Theme (Default)

The dark theme uses a near-black base with cyan as the primary accent, evoking classic cyberpunk terminals.

| Role | Color | Value |
|------|-------|-------|
| Background Primary | Near-black | `#050a0e` |
| Background Secondary | Dark slate | `#0a1014` |
| Background Page | Dark cyan tint | `#041518` |
| Accent Primary | Cyan | `#00d9ff` |
| Accent Secondary | Orange | `#ff9f43` |
| Accent Tertiary | Purple | `#a29bfe` |
| Accent Quaternary | Pink | `#fd79a8` |
| Text Primary | Light gray | `#e6edf3` |
| Text Secondary | Muted gray | `#9eaab6` |
| Text Muted | Dim gray | `#5a6672` |

#### Light Theme

The light theme uses warm paper tones for a comfortable reading experience while maintaining the pastel accent system.

| Role | Color | Value |
|------|-------|-------|
| Background Primary | Warm paper | `#faf6f1` |
| Background Secondary | Cream | `#f5ede4` |
| Accent Primary | Deep cyan | `#0097a7` |
| Accent Secondary | Deep orange | `#d35400` |
| Accent Tertiary | Deep purple | `#6d28d9` |
| Accent Quaternary | Deep pink | `#be185d` |
| Text Primary | Dark brown | `#2d2419` |
| Text Secondary | Medium brown | `#5c4d3d` |

### 2. Typography System

#### Font Stack

| Purpose | Font Family | Character |
|---------|-------------|-----------|
| Display/Headers | Orbitron | Futuristic, geometric, cyberpunk |
| Body Text | Rajdhani | Clean, readable, slight tech feel |
| Monospace | Share Tech Mono | Code, metadata, timestamps |

#### Type Scale

Base font size: `16px`

| Element | Size | Weight | Line Height |
|---------|------|--------|-------------|
| Story Title | `1.2rem` | 500 | 1.4 |
| Story Meta | `0.95rem` | 400 | - |
| Comment Text | `0.95rem` | 400 | 1.6 |
| Article Body | `1.05rem` | 400 | 1.8 |
| Detail Title | `1.75rem` | 600 | 1.3 |

#### Font Size Modes

Three modes accommodate different reading preferences:

| Mode | Base | Article Body | Story Title |
|------|------|--------------|-------------|
| Compact | `0.875rem` | `0.975rem` | `1rem` |
| Normal | `1rem` | `1.175rem` | `1.2rem` |
| Comfortable | `1.125rem` | `1.3rem` | `1.25rem` |

### 3. Density Modes

Three density settings control spacing and visual weight:

| Mode | Story Padding | Story Gap | Use Case |
|------|---------------|-----------|----------|
| Compact | `0.75rem 1rem` | `0.75rem` | Information density |
| Normal | `1.25rem 1.75rem` | `1rem` | Balanced |
| Comfortable | `1.25rem 1.5rem` | `1.25rem` | Relaxed reading |

### 4. Visual Identity Elements

#### Cyber Frame

A distinctive border pattern wraps the application:

```
┌────────────────────────────────┐
│ ┌──                        ──┐ │
│ │                            │ │
│ │      Content Area          │ │
│ │                            │ │
│ └──                        ──┘ │
└────────────────────────────────┘
```

- 3px border with 30px corner accents
- Glowing box-shadow with cyan tint
- Corner brackets with extended shadows
- Subtle breathing animation (4s cycle)

#### Grid Background

- 60px x 60px grid pattern
- Low opacity (4-5%) for subtlety
- Creates depth without distraction

#### Glassmorphism Cards

Story and comment cards use glass-like styling:

- Linear gradients with transparent colors
- `backdrop-filter: blur(4px)`
- Expanding corner accents on hover (12px → 20px)
- Type-based accent colors:
  - Ask HN: Purple border
  - Show HN: Pink border
  - Jobs: Orange border

#### Glow Effects

Contextual glows provide visual feedback:

- Score heat indicators (warm → hot → fire)
- Hover state glows on interactive elements
- Text shadows on headers and links

### 5. Animation System

#### Timing Standards

| Animation Type | Duration | Easing |
|----------------|----------|--------|
| Micro-interaction | `0.25s` | `ease` |
| Card hover | `0.3s` | `cubic-bezier(0.4, 0, 0.2, 1)` |
| Page transition | `0.3s` | `cubic-bezier(0.4, 0, 0.2, 1)` |
| Modal entrance | `0.2-0.25s` | `ease` |
| Loading skeleton | `1.5-2s` | `ease-in-out` |

#### Breathing Animations

Subtle "breathing" effects create organic feel:

- Story cards: 6s cycle, orange tint pulse
- Comments: 8s cycle, purple tint pulse
- Detail view: 8s cycle, cyan tint pulse

#### Stagger Animations

List items animate in sequence:

- Stories: 30ms delay increments
- Comments: 50ms delay increments
- Maximum stagger: 20 items

#### Accessibility

All animations respect `prefers-reduced-motion`:

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### 6. Zen Mode

A distraction-free reading mode:

- Header hidden completely
- Fullscreen content overlay
- Reduced visual chrome
- Larger typography for comfort
- Zen badge indicator (top-right)

### 7. Component Patterns

#### Story Cards

- Gradient glass background
- Left border indicates story type
- Corner accents expand on hover
- translateX shift on hover (4-8px)
- Read state dims to 75% opacity

#### Comments

- Depth-based left border colors:
  - Depth 0: Cyan
  - Depth 1: Purple
  - Depth 2: Pink
  - Depth 3+: Orange
- CSS Grid collapse animation
- Thread line indicators

#### Interactive Elements

- Buttons: Display font, uppercase, letter-spacing
- Active states: Gradient backgrounds, double glow
- Focus states: Visible outlines for accessibility

#### Loading States

- Spinner: 50px cyan rotating indicator
- Skeleton: Pulse + shimmer animations
- Staggered entrance delays

#### Toast Notifications

- Slide-in from right edge
- Type-based left border (info/success/warning/error)
- Auto-dismiss with configurable duration
- backdrop-filter blur

## Consequences

### Positive

1. **Distinctive Identity**: Immediately recognizable aesthetic
2. **Reading Comfort**: Optimized typography and spacing
3. **User Agency**: Font size and density controls
4. **Theme Support**: Dark and light modes with system preference detection
5. **Accessibility**: Reduced motion support, focus indicators
6. **Performance**: CSS-based animations, minimal JavaScript

### Negative

1. **Custom Fonts**: Additional network requests (mitigated by bundling)
2. **Learning Curve**: Unfamiliar aesthetic for some users
3. **Complexity**: Maintaining two color themes
4. **Browser Support**: backdrop-filter not universal (graceful degradation)

### Neutral

1. **Opinionated Design**: Strong aesthetic may not appeal to everyone
2. **Animation Heavy**: Personal preference varies

## Implementation Details

### CSS Architecture

```
web/src/styles/
└── main.css          # Complete design system (single file)
```

Key sections:
- CSS Custom Properties (themes)
- Base typography
- Layout components
- Interactive components
- Animations and keyframes
- Font size modes
- Density modes
- Zen mode overrides
- Reduced motion overrides

### Theme Application

```typescript
// Applied via data attributes on <html>
document.documentElement.dataset.theme = 'dark' | 'light'
document.documentElement.dataset.fontSize = 'compact' | 'normal' | 'comfortable'
document.documentElement.dataset.density = 'compact' | 'normal' | 'comfortable'
```

### Settings Persistence

```typescript
interface Settings {
  theme: 'dark' | 'light' | 'system'
  fontSize: 'compact' | 'normal' | 'comfortable'
  density: 'compact' | 'normal' | 'comfortable'
  defaultFeed: 'top' | 'new' | 'best' | 'ask' | 'show' | 'jobs'
}
```

Settings stored in localStorage with system preference listener for automatic theme switching.

## Alternatives Considered

### 1. Material Design

**Rejected** because:
- Too generic, doesn't create unique identity
- Over-engineered for our needs
- Would blend in with other apps

### 2. Minimalist/HN-like

**Rejected** because:
- Doesn't differentiate from web HN
- Misses opportunity for desktop-native experience
- Less engaging for extended use

### 3. Full Neon Cyberpunk

**Rejected** because:
- Too aggressive for reading
- Eye strain concerns
- Limited appeal

### 4. CSS Framework (Tailwind, etc.)

**Rejected** because:
- Additional build complexity
- Less control over animations
- Larger bundle size for our needs

## Future Enhancements

1. **Custom Accent Colors**: User-selectable accent color palette
2. **Font Selection**: Alternative font stacks
3. **Animation Intensity**: User control over animation levels
4. **High Contrast Mode**: Enhanced accessibility option
5. **Custom Themes**: User-created color schemes

## References

- [Orbitron Font](https://fonts.google.com/specimen/Orbitron)
- [Rajdhani Font](https://fonts.google.com/specimen/Rajdhani)
- [Share Tech Mono](https://fonts.google.com/specimen/Share+Tech+Mono)
- [prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)
- [CSS Custom Properties](https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties)
