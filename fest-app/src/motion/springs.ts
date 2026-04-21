// Spring presets — tuned for crisp, premium feel.
// Usage: withSpring(value, springs.snappy)

export const springs = {
  // Default UI spring: quick, minimal overshoot
  snappy: { damping: 22, stiffness: 260, mass: 0.9 } as const,
  // Slightly softer for layout/position changes
  smooth: { damping: 20, stiffness: 180, mass: 0.9 } as const,
  // Bouncy for delightful badges/confetti
  bouncy: { damping: 14, stiffness: 240, mass: 0.9 } as const,
  // Press feedback
  press: { damping: 24, stiffness: 380, mass: 0.6 } as const,
  // Entry (hero, title)
  entry: { damping: 18, stiffness: 140, mass: 0.8 } as const,
  // Morphing tab indicator
  morph: { damping: 22, stiffness: 320, mass: 0.8 } as const,
} as const;

export const easings = {
  ambientMs: 7000,
  pulseMs: 1600,
  shimmerMs: 1400,
  drift: 12000,
} as const;
