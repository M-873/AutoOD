#!/bin/bash
# Final deployment script for AutoOD on Render

echo "🚀 AutoOD Deployment Script"
echo "============================"

# Check if we're in the right directory
if [ ! -f "render.yaml" ]; then
    echo "❌ Error: render.yaml not found. Are you in the AutoOD-main directory?"
    exit 1
fi

echo "✅ Found render.yaml configuration"

# Check if required files exist
echo "📋 Checking required files..."
required_files=(
    "backend/main_render.py"
    "backend/requirements_render.txt"
    "build.sh"
    "Frontend/package.json"
)

for file in "${required_files[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $file exists"
    else
        echo "❌ $file missing"
        exit 1
    fi
done

echo ""
echo "🎯 Deployment Ready!"
echo "====================="
echo ""
echo "Next steps:"
echo "1. Commit your changes to Git"
echo "2. Push to GitHub"
echo "3. Connect your GitHub repo to Render at:"
echo "   https://dashboard.render.com"
echo ""
echo "Your app will be available at:"
echo "https://autood-f9bq.onrender.com"
echo ""
echo "API endpoints:"
echo "- Health: https://autood-f9bq.onrender.com/"
echo "- Models: https://autood-f9bq.onrender.com/api/models"
echo "- Detect: https://autood-f9bq.onrender.com/api/detect"
echo ""
echo "🎉 Happy deploying!"