#!/bin/bash

# AutoOD Render Deployment Script
# This script prepares and deploys AutoOD to Render

echo "🚀 Starting AutoOD deployment to Render..."

# Step 1: Verify we're in the correct directory
if [ ! -f "render.yaml" ]; then
    echo "❌ Error: render.yaml not found. Are you in the AutoOD-main directory?"
    exit 1
fi

# Step 2: Check if git is initialized
if [ ! -d ".git" ]; then
    echo "📁 Initializing git repository..."
    git init
fi

# Step 3: Add all changes to git
echo "📦 Adding changes to git..."
git add .
git add -f backend/requirements_render.txt
git add -f backend/main_render.py
git add -f render.yaml
git add -f build.sh

# Step 4: Commit changes
echo "💾 Committing changes..."
git commit -m "Deploy AutoOD to Render with optimized configuration

- Updated requirements_render.txt with CPU-only dependencies
- Created main_render.py with YOLO-only models for resource optimization
- Configured render.yaml with 2GB disk and optimized settings
- Updated build.sh for Render deployment"

# Step 5: Check if remote exists
if git remote get-url origin > /dev/null 2>&1; then
    echo "🔄 Pushing to existing remote..."
    git push origin main
else
    echo "📋 To complete deployment:"
    echo "1. Create a new repository on GitHub/GitLab"
    echo "2. Add your remote: git remote add origin <your-repo-url>"
    echo "3. Push: git push -u origin main"
    echo "4. Connect the repo to Render dashboard"
fi

echo "✅ Deployment preparation complete!"
echo "📋 Next steps:"
echo "1. Check Render dashboard for deployment status"
echo "2. Monitor logs for any startup issues"
echo "3. Test API endpoints once deployment is complete"
echo "4. Service URL: https://autood.onrender.com"

echo "🎯 Deployment script finished!"