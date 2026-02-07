# AutoOD Render Deployment Guide

## Overview
AutoOD is a multi-model object detection application with a React frontend and FastAPI backend, optimized for deployment on Render.

## Deployment Steps

### 1. Repository Structure
```
AutoOD/
├── Frontend/                 # React frontend
│   ├── src/
│   ├── public/
│   └── package.json
├── backend/                 # FastAPI backend
│   ├── main_render.py      # Simplified backend for Render
│   ├── requirements_render.txt # Optimized dependencies
│   └── core/
├── build.sh                # Build script
├── render.yaml             # Render configuration
└── start.sh                # Start script
```

### 2. Render Configuration
The `render.yaml` file configures:
- Python 3.9.21 runtime
- Node.js 18 for frontend build
- 2GB disk space for model caching
- CPU-optimized PyTorch installation

### 3. Build Process
The build script (`build.sh`) performs:
1. Installs Python dependencies (CPU-only PyTorch)
2. Builds the React frontend
3. Copies frontend assets to backend/dist
4. Creates torch cache directory

### 4. Backend Optimization
The `main_render.py` file includes:
- Simplified model loading (YOLO models only)
- Optimized for Render's resource constraints
- Proper error handling and logging
- CORS configuration for production

### 5. Deployment Commands
```bash
# Local testing
cd Frontend && npm install && npm run build

# Backend testing
cd backend && pip install -r requirements_render.txt
python main_render.py

# Deploy to Render
# Push to GitHub and connect to Render via dashboard
```

### 6. Environment Variables
- `PORT`: Render-assigned port (default: 10000)
- `PYTHON_VERSION`: 3.9.21
- `NODE_VERSION`: 18
- `TORCH_HOME`: /opt/data/torch (for model caching)

### 7. API Endpoints
- `GET /`: Health check
- `GET /api/models`: Available detection models
- `POST /api/detect`: Object detection
- `POST /api/detect-annotated`: Detection with annotated image
- `GET /api/classes`: Available object classes

### 8. Frontend Features
- Modern React with TypeScript
- Shadcn/ui components
- Responsive design
- Real-time object detection
- Annotation tools

## Troubleshooting

### Common Issues
1. **Build fails**: Check Node.js and Python versions
2. **Model loading slow**: First load downloads models
3. **Memory issues**: Use smaller YOLO models (yolov8n.pt)
4. **CORS errors**: Check allowed origins in main_render.py

### Performance Tips
- Use YOLOv8n (nano) for fastest inference
- Enable model caching with TORCH_HOME
- Monitor memory usage in Render dashboard
- Consider upgrading Render plan for better performance

## Support
For issues with deployment, check:
- Render logs in dashboard
- Application health at https://autood-f9bq.onrender.com
- API status at https://autood-f9bq.onrender.com/api/models