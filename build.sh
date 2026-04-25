#!/bin/bash
set -e
echo "🚀 Starting Build Process..."

# 1. Install Python Dependencies (Render-optimized, CPU-only)
echo "📦 Installing Python dependencies..."
pip install --no-cache-dir -r backend/requirements_render.txt

# 2. Setup NanoDet
echo "📥 Setting up NanoDet..."
if [ ! -d "backend/nanodet" ]; then
    git clone https://github.com/RangiLyu/nanodet.git backend/nanodet
fi
pip install -e ./backend/nanodet

# 3. Build Frontend
echo "🏗️ Building Frontend..."
cd Frontend
npm install --no-audit --no-fund
npm run build
cd ..

# 3. Move Assets
echo "📂 Moving build assets to backend..."
mkdir -p backend/dist
rm -rf backend/dist/*
cp -r Frontend/dist/. backend/dist/

# 4. Download Model Weights
echo "📥 Downloading model weights..."
python backend/download_weights.py

# 5. Finish Build
echo "✅ Build Complete! The app is ready to run."
