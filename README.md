# Brain Simulator XR

A production-ready WebXR application for 3D mind mapping, featuring cloud synchronization and cross-device support (PC, Mobile, VR).

## Features

- **WebXR Support:** Compatible with Meta Quest 2 and other VR headsets. Includes controller support for manipulation and locomotion.
- **Mobile Optimized:** Touch controls (pinch-to-zoom) and Gyroscope Look mode.
- **Cloud Synchronization:** Real-time sync of nodes, connections, and library assets using Supabase.
- **Grouping & Undo:** Organize thoughts with groups and undo mistakes easily.
- **Asset Library:** Save and reuse node templates across sessions.

## Setup

1.  **Supabase Configuration:**
    - Create a Supabase project.
    - Create tables: `nodes`, `connections`, `library`.
    - Enable Realtime for these tables.
    - Copy your Project URL and Anon Key.
    - Edit `js/config.js` and paste your credentials.

2.  **Running:**
    - Serve the project using a local web server (e.g., `python3 -m http.server`, `npx serve`).
    - Open `index.html` in a browser.

## Database Schema

### `nodes`
- `id` (uuid, primary key)
- `word` (text)
- `color` (text)
- `scale` (float)
- `x`, `y`, `z` (float)
- `qx`, `qy`, `qz`, `qw` (float)
- `parent_id` (uuid, nullable)
- `type` (text, default 'node')

### `connections`
- `id` (uuid, primary key)
- `from_node` (uuid)
- `to_node` (uuid)
- `thickness` (float)

### `library`
- `id` (uuid, primary key)
- `word` (text)
- `color` (text)
- `scale` (float)

## Controls

- **PC:** WASD to move, Drag to select/move, Ctrl+Click to multi-select.
- **Mobile:** Touch drag to move, Pinch to zoom, Toggle Gyro for look.
- **VR:** Thumbstick to move/turn, Ray to select, Grip to grab.
