# Animal Kingdom Idle

A lightweight idle/incremental game prototype built per the design prompt.  
- **One HTML** launcher (`index.html`)  
- **A few JS files** (`js/core.js`, `js/ui.js`)  
- **Emoji sprites** in `sprites/` (SVGs wrapping system emoji, so they stay crisp and tiny)

## How to run
1. Download and unzip **AnimalKingdomIdle.zip**.
2. Open `index.html` in any modern desktop or mobile browser.
3. Your progress auto-saves every 30s (localStorage). Offline gains are applied on return.

## Gameplay
- Start with **1 Monkey** (1 food/sec). Food is your currency.
- Buy animals on the **left**; they roam around a circular **pot** on the **right**.
- Costs scale by ×1.3 per purchase. Milestones: every **25** owned of a type **double** that type’s output.
- Unlocks:
  - **Zebra** (after 100 monkeys) — each zebra boosts monkey output by **+0.5%**.
  - **Gorilla** (after 50 zebras) — **+1%** to monkeys & zebras each.
  - **Elephant** (after 50 gorillas) — occasional **10×** bursts; **+30 min** offline cap each.
  - **Parrot** (after 50 elephants) — **+10% global speed each** and periodic cache drops.
- **Prestige** converts lifetime production into **Relics** (≈ √(total/1e12)), each giving **+1% global** production permanently.

## Files
- `index.html` – UI layout, panels, and canvas.
- `js/core.js` – math, data, saving, offline, prestige.
- `js/ui.js` – shop & upgrades UI, and the pot roaming simulation.
- `sprites/*.svg` – emoji-based lightweight sprites.

## Notes
- This is a clean, single-page prototype designed for quick iteration.
- The sprites are **SVG with a single emoji character**; browsers render them using your OS emoji font.
- Built with **prompt coding** via ChatGPT.
