#!/bin/bash
# Exit on error
set -e

echo "🚀 Starting Render Build..."

# 1. Install Dependencies
echo "📦 Installing requirements..."
pip install --no-cache-dir -r requirements_render.txt

# 2. Clone NanoDet Repository
if [ ! -d "nanodet" ]; then
    echo "📥 Cloning NanoDet official repository..."
    git clone https://github.com/RangiLyu/nanodet.git
fi

echo "📦 Installing NanoDet in editable mode..."
pip install -e ./nanodet

# 3. Download Model Weights
echo "📥 Downloading model weights..."
python download_weights.py

echo "✅ Build Process Complete!"
