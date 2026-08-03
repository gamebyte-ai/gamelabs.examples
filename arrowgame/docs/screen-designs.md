# Screen Designs

## Overview
Total Screens: 2
Visual Style: Glossy 3D voxel blocks, hyper-casual, bright pastel gradient background
Color Palette: Vibrant primary/secondary colors (red, blue, yellow, green, orange) on soft sky-blue/lavender gradient

## Screens

### 1. Gameplay
- **Purpose**: Core puzzle screen where player taps blocks to slide them off the board
- **Key Elements**: Level indicator (top-left), restart button (top-right), NxN grid board (center) with glossy 3D cube blocks each showing a directional arrow, empty cells shown as darker recessed slots
- **User Flow**: Entry point after tapping Play; player interacts until board is cleared, then transitions to Complete screen
- **Mockup**: `docs/screen-designs/screen-gameplay.webp`

### 2. Level Complete
- **Purpose**: Celebrate level clear and let player advance
- **Key Elements**: "LEVEL COMPLETE" banner, confetti, star rating, Next button, restart icon
- **User Flow**: Shown automatically when last block exits the board; Next button loads next level
- **Mockup**: `docs/screen-designs/screen-complete.webp`

## Notes
Reduction-scope prototype: no separate main menu screen — game boots directly into level 1 gameplay (per confirmed quick-prototype scope). Restart icon on gameplay screen covers the "try again" need.
