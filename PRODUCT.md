# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React 19 + Vite 8 + TypeScript + Tailwind CSS v4 + Leaflet (Frontend) with FastAPI + PyTorch + SQLite (Backend)

## Users

1. **Civic Observers & Citizens of Pune**:
   - Encounter roadside plastic accumulations, blocked storm drains, and monsoon waterlogging.
   - Need rapid, friction-free reporting with accurate geotagging and clear feedback on municipal response.
2. **Municipal Drainage Engineers & Ward Sanitation Inspectors (PMC/PCMC)**:
   - Operating under monsoon emergency or pre-monsoon desilting schedules.
   - Require evidence-backed risk prioritization to deploy vacuum suckers and desilting crews where blockage threatens critical conduits.

## Product Purpose

ECO-ROUTE is a civic environmental intelligence platform operating in Pune, Maharashtra. It connects citizen-reported plastic waste accumulations with municipal drainage telemetry to quantify and prevent urban waterlogging hazards. The platform bridges the gap between surface solid waste and subsurface hydraulic infrastructure.

## Positioning

Unlike generic municipal complaint portals that treat litter merely as an aesthetic concern, ECO-ROUTE correlates waste material types (via a fine-tuned MobileNetV3 classifier) with proximity to mapped storm drains, culverts, catch basins, and natural river channels (Mutha, Ramnadi). It produces an explainable 0–100 risk score and transparently separates proximity from confirmed hydraulic connectivity.

## Operating Context

- Field and desktop usage in municipal ward offices and emergency control rooms.
- High-stakes monsoon weather events where standing water disrupts bus routes and highway underpasses.
- Desktop operational command centers analyzing incident maps alongside drainage assets.

## Capabilities and Constraints

- **Capabilities**:
  - Image upload with fine-tuned MobileNetV3 classification on 9 waste categories from the local RealWaste dataset.
  - Visible extent estimation based on spatial gradient and contour saliency.
  - Great-circle distance calculations to mapped drains and waterways using Haversine formulations.
  - Explainable multi-factor scoring (hydraulic hazard, extent, drain proximity, asset choke state, riparian buffer).
  - Municipal assignment, status transitions, before-and-after photo evidence, and supervisor verification.
- **Constraints**:
  - Operates completely on local resources (SQLite, CPU PyTorch, OpenStreetMap tiles). No paid APIs or cloud dependencies.
  - TACO dataset in local workspace contains annotations but 0 local images; RealWaste (4,752 local images) serves as the primary ground truth.
  - Proximity to waterways is never equated to downhill drainage connectivity without confirmed overland infrastructure.

## Brand Commitments

- **Tone & Identity**: Authoritative, environmental, civic, scientific, and clear.
- **Visual Stance**: Restrained, map-centered, clean, and legible. Strictly avoids generic "AI template" tropes (such as neon gradient cards, meaningless donut charts, or decorative badges).

## Evidence on Hand

- 4,752 RealWaste training/validation images (`realwaste/realwaste-main/RealWaste/`).
- Fine-tuned MobileNetV3 weights (`ml/weights/realwaste_mobilenetv3.pth`) with 80.95% validation accuracy.
- Mapped municipal drainage network and waterway assets for Pune (Shivajinagar, Kothrud, Bavdhan, Mutha River, Hadapsar).
- Integration test suite passing 7/7 tests (`tests/test_backend.py`).

## Product Principles

1. **Grounded Scientific Evidence**: Never fabricate hydraulic connectivity, synthetic sensor reads, or classification results.
2. **Explainable Actionable Priority**: Every risk point must explain its rationale and translate into a concrete operational directive.
3. **Closed-Loop Resolution**: An incident is only resolved when verified with photographic "After" evidence and supervisor sign-off.
4. **Restrained Operational Design**: Built for rapid visual triage by field officers and civil engineers under pressure.

## Accessibility & Inclusion

- WCAG AA contrast compliance (minimum 4.5:1 on text).
- Semantic headings and clear button action verbs.
- High-clarity color tokens that do not rely solely on color to convey risk levels (paired with numerical scores and explicit textual ratings).
