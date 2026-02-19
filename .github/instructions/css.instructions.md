---
applyTo: '**/*.css'
---

# CSS Conventions

## Architecture

Single CSS file (`public/styles.css`) with design tokens via custom properties. No preprocessor, no CSS-in-JS, no utility frameworks.

## Organization Order

1. Custom properties (`:root` design tokens)
2. Reset & base styles
3. Typography (gradients, section headers)
4. Buttons (gold, outline, telegram, sizes)
5. Components (navbar, hero, tips, stats, pricing, faq, footer)
6. Loading states (spinner, empty states)
7. Animations (reveal, keyframes)
8. Responsive (breakpoints: 1024px, 768px, 480px)

## Design Tokens

```css
:root {
  --bg-primary: #0a0a0f; /* Main background */
  --bg-secondary: #12121a; /* Section backgrounds */
  --bg-card: #16161f; /* Card backgrounds */
  --gold: #d4a853; /* Primary accent */
  --gold-light: #f0d078; /* Hover/highlight */
  --gold-dark: #a67c2e; /* Active/pressed */
  --red: #e74c3c; /* Error/loss */
  --green: #2ecc71; /* Success/win */
  --font-display: 'Space Grotesk'; /* Headings */
  --font-body: 'Inter'; /* Body text */
  --radius-sm: 8px; /* Buttons */
  --radius-md: 12px; /* Small cards */
  --radius-lg: 20px; /* Tip cards */
  --radius-xl: 28px; /* Pricing cards */
}
```

## Rules

- Always use custom properties for colors, spacing, typography, borders
- Mobile-first responsive design with `min-width` breakpoints
- Use `rem` for font sizes, `px` for borders/shadows
- Prefix animation names descriptively (`fadeInUp`, `pulseGold`, `slideDown`)
- No `!important` unless overriding third-party styles
- Group related properties logically (box model -> visual -> typography -> animation)
