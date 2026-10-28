# ECO-ROUTE: Plastic Waste and Urban Waterlogging Intelligence Platform

A functional hackathon MVP that tackles urban drainage blockage and runoff waterlogging by integrating citizen reporting, fine-tuned ML waste recognition, geospatial drainage proximity analysis, explainable multi-factor risk scoring, and municipal dispatch & verification workflows.

---

## 🌟 Key Features

1. **Citizen Incident Reporting**:
   - Report plastic waste accumulations or active waterlogging incidents.
   - Photograph upload with real-time ML inference.
   - Interactive Leaflet map coordinate picker (click anywhere to set incident latitude/longitude).

2. **Fine-Tuned ML Model (MobileNetV3 on RealWaste)**:
   - Trained on 4,752 images from the local `realwaste` dataset across 9 categories (`Plastic`, `Cardboard`, `Food Organics`, `Glass`, `Metal`, `Miscellaneous Trash`, `Paper`, `Textile Trash`, `Vegetation`).
   - Achieves **80.95% top-1 validation accuracy**.
   - Outputs candidate category probability distributions and estimates visible waste extent / area coverage.

3. **Geospatial Drainage & Hydrology Analysis**:
   - Grounded in local municipal assets (storm drains, culverts, catch basins, rivers, canals).
   - Measures great-circle distance via Haversine formulation.
   - Strictly distinguishes drain proximity from river proximity. Highlights uncertainties and flags lack of verified overland flow conduits.

4. **Explainable Risk Engine (0–100 Preliminary Risk Score)**:
   - Evaluates:
     - Incident nature (+15 to +35 pts)
     - Material hydraulic hazard (+6 to +25 pts, e.g. films vs. rigid debris)
     - Waste extent footprint (+6 to +20 pts)
     - Drain proximity & connectivity (+3 to +20 pts)
     - Downstream infrastructure choke state (+12 pts)
     - Riparian buffer (+5 pts)
   - Categorizes incidents into `LOW`, `MODERATE`, `HIGH`, or `CRITICAL` with transparent contributing factor breakdowns and dispatch actions.

5. **Municipal Authority Dashboard**:
   - Filter by incident type, risk score, and status.
   - Triage and assign reports to sanitation response crews.
   - Upload cleanup resolution photographs (After evidence).
   - Supervisor verification with digital sign-off.

---

## 🚀 How to Run

### 1. Start the Backend API (FastAPI)

In a terminal window:

```powershell
cd "D:\code\Projects\ECO_ROUTE JSPM"
python -m uvicorn backend.main:app --reload --port 8000
```

- API Base: `http://127.0.0.1:8000`
- Swagger Documentation: `http://127.0.0.1:8000/docs`

### 2. Start the Frontend (Vite + React + TypeScript + Tailwind)

In a second terminal window:

```powershell
cd "D:\code\Projects\ECO_ROUTE JSPM\frontend"
npm run dev
```

- Open your browser at `http://localhost:5173`

### 3. Run Automated Tests

```powershell
cd "D:\code\Projects\ECO_ROUTE JSPM"
python -m pytest -v tests/test_backend.py
```
