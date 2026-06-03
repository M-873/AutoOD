#!/bin/bash
set -e
echo "🚀 Starting Build Process..."

# 1. Install Python Dependencies (Render-optimized, CPU-only)
echo "📦 Installing Python dependencies..."
pip install --no-cache-dir -r backend/requirements_render.txt

# 2. Setup NanoDet
echo "📥 Setting up NanoDet..."
if [ ! -d "backend/nanodet" ]; then
    git clone --depth 1 https://github.com/RangiLyu/nanodet.git backend/nanodet
fi
pip install -e ./backend/nanodet

# 3. Build Frontend (PRE-BUILT IN REPO)
echo "🏗️ Using pre-built frontend from backend/dist..."
# We skip 'npm install' and 'npm run build' on Render to save memory and time.
# The 'backend/dist' folder is now managed locally and committed to Git.

# 5. Download Model Weights
echo "📥 Downloading model weights..."
python backend/download_weights.py

# 5. Finish Build
echo "✅ Build Complete! The app is ready to run."
