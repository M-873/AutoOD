# AutoOD Render Deployment Checklist

## Pre-Deployment ✅
- [x] Optimized requirements_render.txt (removed heavy dependencies)
- [x] Created main_render.py with YOLO-only models
- [x] Configured render.yaml with proper settings
- [x] Updated build.sh for Render deployment
- [x] Set up CPU-only PyTorch for resource optimization

## Deployment Steps 🚀

### 1. Git Repository Setup
```bash
# Initialize git (if not already done)
git init

# Add all files
git add .
git add -f backend/requirements_render.txt
git add -f backend/main_render.py
git add -f render.yaml
git add -f build.sh

# Commit changes
git commit -m "Deploy AutoOD to Render with optimized configuration"
```

### 2. GitHub Repository Creation
1. Go to GitHub.com and create a new repository
2. Name it "AutoOD" or similar
3. Don't initialize with README (we already have one)
4. Copy the repository URL

### 3. Push to GitHub
```bash
# Add remote repository
git remote add origin <your-github-repo-url>

# Push to main branch
git push -u origin main
```

### 4. Render Deployment
1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click "New" → "Web Service"
3. Connect your GitHub repository
4. Render should auto-detect the configuration from render.yaml
5. Click "Create Web Service"

### 5. Monitor Deployment
- Watch the deployment logs in Render dashboard
- Deployment typically takes 5-15 minutes
- Look for any error messages in the logs

## Post-Deployment Verification ✅

### Test API Endpoints
```bash
# Test models endpoint
curl https://autood.onrender.com/api/models

# Test root endpoint
curl https://autood.onrender.com

# Test with longer timeout if needed
curl --max-time 60 https://autood.onrender.com/api/models
```

### Expected Response
```json
[
  "yolo/yolov8n.pt",
  "yolo/yolov8s.pt", 
  "yolo/yolov8m.pt",
  "yolo/yolo11n.pt",
  "yolo/yolo11s.pt"
]
```

## Troubleshooting 🔧

### If API Times Out
1. **Check Render Logs**: Look for startup errors in dashboard
2. **Memory Issues**: Service might be crashing due to model loading
3. **Service Sleeping**: Free services sleep after 15min inactivity
4. **Port Issues**: Verify PORT environment variable

### If Build Fails
1. **Dependencies**: Check requirements_render.txt syntax
2. **Python Version**: Ensure Python 3.9.21 is specified
3. **Build Script**: Verify build.sh permissions and content

### Performance Optimization
- **Model Caching**: Uses TORCH_HOME=/opt/data/torch
- **CPU Only**: PyTorch CPU version for resource efficiency
- **Gunicorn Workers**: 2 workers for optimal performance
- **Timeout**: 120 seconds for model loading

## Service Configuration 📋
- **Service Name**: autood
- **URL**: https://autood.onrender.com
- **Python Version**: 3.9.21
- **Node Version**: 18
- **Disk**: 2GB for model caching
- **Workers**: 2
- **Timeout**: 120 seconds

## Support Resources 📚
- [Render Documentation](https://render.com/docs)
- [FastAPI Deployment Guide](https://fastapi.tiangolo.com/deployment/)
- [YOLO Documentation](https://docs.ultralytics.com/)