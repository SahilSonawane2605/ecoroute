# Design System — ECO-ROUTE

## Surface Mode
**Operate**: Civic environmental monitoring, geospatial hazard triage, and municipal dispatch control room.

## Typography
- **Primary Typeface**: `Inter`, `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, sans-serif.
- **Hierarchy Scale**:
  - H1 / App Title: 20px / 1.25rem, semibold (600), tracking -0.02em.
  - Section Headers: 14px / 0.875rem, semibold (600), uppercase tracking 0.05em.
  - Body & Form Controls: 13px / 0.8125rem, normal (400), leading 1.5.
  - Microcopy & Metadata: 11px / 0.6875rem, medium (500).
  - Tabular Numerals: `font-variant-numeric: tabular-nums` for risk scores, coordinates, and metrics.

## Color Palette (Hydraulic Environmental Tokens)
- **Neutral Canvas**: `#f8fafc` (Slate 50), Clean field background.
- **Surface Elevation**: `#ffffff` (Solid White), 1px `#e2e8f0` (Slate 200) hairline borders.
- **Primary Civic Accent**: `#047857` (Deep Emerald 700), `#065f46` (Emerald 800 for active/focus).
- **Waterway & River Blue**: `#0284c7` (Sky 600), `#0369a1` (Sky 700).
- **Drainage & Infrastructure Green**: `#059669` (Emerald 600).
- **Risk Severity Levels**:
  - **CRITICAL (75–100)**: `#b91c1c` (Red 700 text), `#fef2f2` (Red 50 background), `#fecaca` border.
  - **HIGH (50–74)**: `#c2410c` (Orange 700 text), `#fff7ed` (Orange 50 background), `#fed7aa` border.
  - **MODERATE (25–49)**: `#b45309` (Amber 700 text), `#fffbeb` (Amber 50 background), `#fde68a` border.
  - **LOW (< 25)**: `#15803d` (Green 700 text), `#f0fdf4` (Green 50 background), `#bbf7d0` border.

## Spatial System & Layout
- Top navigation bar: 56px fixed height with crisp hairline border.
- Split Operational Workspace:
  - Left Panel: Live Incident Prioritization Queue with search, multi-axis filters, and quick triage status.
  - Right Panel: Full-height interactive Leaflet GIS workspace with layer toggling (Drains, Waterways, Risk Heat).
- Drawer: 540px wide sliding inspection drawer showing exact photographic evidence, ML candidate probabilities, and physical factor rationale.

## Interactive State System
- Buttons: Default, hover (`transition: background 150ms ease`), active, focus (`outline: 2px solid #047857; outline-offset: 2px`), disabled (`opacity: 0.5`).
- Tables: Row hover subtle tint (`#f1f5f9`), clear active row border indicator.
- Empty States: Actionable instructions with direct button to file first report.
