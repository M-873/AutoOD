# AutoOD Application: Technical Architecture & Deployment Guide

This document is specifically designed to provide a comprehensive and low-level understanding of the **AutoOD** architecture, workflows, and deployment setups. It serves as a definitive guide for coding agents and developers to quickly understand how the system is wired together and deployed.

---

## 1. High-Level Architecture
AutoOD is a Monolith-Deployment architecture using a decoupled code base. It consists of a React frontend and a FastAPI (Python) backend, designed to perform real-time, in-browser configured object detection using Ultralytics YOLO models.

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui.
- **Backend:** FastAPI, Python 3.9, Uvicorn/Gunicorn, PyTorch (CPU-optimized for production), Ultralytics YOLO.
- **Deployment Platform:** Render (Free Tier, Web Service).

The frontend and backend reside in the same physical repository but are conceptually decoupled. In production, they are bundled together; the FastAPI backend serves both the API endpoints and the static frontend compiled assets.

---

## 2. Directory Structure & Key Files

```text
AutoOD/
├── Frontend/                 # React frontend (Vite workspace)
│   ├── src/
│   │   ├── components/       # Reusable shadcn/ui components
│   │   ├── pages/            # Application views (AutoODAnnotation.tsx is the core ML UI)
│   │   └── lib/api.ts        # Typed fetch client for backend API communication
│   ├── public/               # Static public assets
│   └── package.json          # Node.js dependencies
│
├── backend/                  # FastAPI backend
│   ├── main.py               # Development entrypoint
│   ├── main_render.py        # Production entrypoint (Render optimized)
│   ├── core/                 # ML processing modules (model_manager.py, detector.py, exporter.py)
│   ├── requirements.txt      # Development Python dependencies
│   └── requirements_render.txt # Production Python dependencies (e.g. CPU-only PyTorch)
│
├── build.sh                  # Core unification build script
├── render.yaml               # Render Infrastructure-as-Code (IaC) configuration
├── package.json              # Root package.json providing workspace scripts
└── PROJECT_SUMMARY.md        # Feature tracking and high-level project summary
```

---

## 3. How the Backend Works
The backend built with FastAPI acts as both an ML inference server and a static file server in production.

### Core Modules (`backend/core/` and `backend/main_render.py`)
1. **Model Management (`SimpleModelManager` or `core.model_manager`):** Dynamically loads `.pt` (PyTorch) model files for YOLO (e.g., `yolov8n.pt`, `yolo11s.pt`). Implements caching to keep models in memory across rapid API calls to avoid I/O bottlenecks. In Render, models cache is managed under the defined `TORCH_HOME` environment directory.
2. **Inference Execution (`detector.py` / `detect_objects_in_image`):** Receives image streams via `multipart/form-data`, decodes them using OpenCV/Pillow, and runs them through the Ultralytics model predicting bounding boxes. Handles dynamic filtering (confidence thresholds and targeted class names).
3. **Annotation Rendering:** Uses OpenCV to draw the inferred bounding boxes and labels directly onto the image buffer for visual verification (`/api/detect-annotated`).
4. **Export Engine (`exporter.py`):** Takes bounding box normalized data and converts it into exportable payload formats: YOLO (`.txt`), COCO (`.json`), standard JSON, or CSV formats for further downstream training.

### Production API Contract (`main_render.py`)
- `GET /`: Health check and basic status.
- `GET /api/models`: Returns a JSON list of available YOLO models.
- `GET /api/classes`: Returns a list of 80 COCO classes.
- `POST /api/detect`: Takes an image, `model`, `confidence`, and `class_filter`. Returns bounding boxes in JSON format.
- `POST /api/detect-annotated`: Takes the same inputs, but returns a raw `.jpg` with annotations overlaid.
- `POST /api/export`: Converts raw annotation JSON data into specified training formats.

---

## 4. How the Frontend Works
The frontend is a Vite-based React Single Page Application (SPA).

1. **State & API Handling:** `Frontend/src/lib/api.ts` provides typed abstractions over the backend endpoints. It supports FormData composition required for uploading images.
2. **Core Interface (`AutoODAnnotation.tsx`):**
   - Implements drag-and-drop file upload.
   - Synchronizes model selection with the backend via `GET /api/models`.
   - Sends the image and UI constraint settings (confidence, classes) to the backend API.
   - Triggers file downloads natively in the browser leveraging Javascript Blob objects after parsing the `/api/export` responses.

---

## 5. Build and Deployment Pipeline (Render)

The deployment relies on Render's Native Python Environment, defined by `render.yaml`. 

### `render.yaml` Configuration
```yaml
services:
  - type: web
    name: autood-backend
    runtime: python
    rootDir: backend
    buildCommand: pip install -r requirements_render.txt
    startCommand: gunicorn main_render:app -w 2 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:$PORT
    envVars:
      - key: PORT
        value: '10000'
      - key: PYTHON_VERSION
        value: 3.9.21
      - key: TORCH_HOME
        value: /tmp/torch
```

### The Deployment Process Step-by-Step

**Step 1. Dependency Resolution:**
Render starts by using the `python` runtime. It executes the `buildCommand`. The primary application compilation is designed to flow through `build.sh`:
- Frontend dependencies are installed (`npm install`).
- The frontend is compiled into a static distribution via Vite (`npm run build`), landing in `Frontend/dist`.
- The `build.sh` script forcibly moves `Frontend/dist` artifacts into `backend/dist`.

*(Note: Depending on how the Render service is directly configured in the dashboard, the `buildCommand` might be overridden to `bash ../build.sh` to trigger the holistic build, rather than just the python dependencies).*

**Step 2. Process Orchestration (`startCommand`):**
The `startCommand` fires up the backend using Gunicorn with Uvicorn workers:
`gunicorn main_render:app -w 2 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:$PORT`
- **Gunicorn:** Acts as the robust process manager.
- **UvicornWorker:** Enables async ASGI features of FastAPI.
- **Dynamic Port:** Render assigns an environment variable `$PORT` (default mapped to 10000 in env variables). 
- **Static Hosting:** `main_render.py` includes a FastAPI static file mount targeting `dist/` (which holds the React SPA index.html and assets) to serve the frontend on the root URL (`/`).

**Step 3. Runtime Optimizations:**
- `requirements_render.txt` specifies **CPU-only** PyTorch wheels: `--extra-index-url https://download.pytorch.org/whl/cpu`. This avoids bloated GPU packages that cause memory bounds or slow startup times on the Render Free Tier.
- The `TORCH_HOME` env var maps PyTorch cache to `/tmp/torch` to keep the filesystem structured and limit caching failures.
- Render scales down memory usage natively. Users are encouraged to utilize `yolov8n.pt` (Nano) bounding to keep memory footprints below Render's strict ceiling.

---

## 6. Development vs. Production Execution

**Local Development (Separated):**
- **Terminal 1:** `cd backend && python main.py` (Local Uvicorn Server on 8000)
- **Terminal 2:** `cd Frontend && npm run dev` (Vite Hot-Reload Server on 8080)
- The frontend config uses an `.env` file (`VITE_API_URL=http://localhost:8000`) or proxy to communicate with the API.

**Production Flow (Unified Monolith):**
- The frontend is compiled to raw HTML/JS/CSS.
- `main_render.py` serves the SPA statically on `/`.
- API endpoints are accessed relatively (`/api/detect`) entirely removing Cross-Origin Resource Sharing (CORS) complexities in the final build.
