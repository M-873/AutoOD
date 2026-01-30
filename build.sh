#!/bin/bash
echo "🚀 Starting Build Process..."

# 1. Install Python Dependencies (Lightweight only)
echo "📦 Installing Python dependencies..."
pip install --no-cache-dir -r backend/requirements.txt

# 2. Build Frontend
echo "🏗️ Building Frontend (this may take a few minutes)..."
npm install --prefix Frontend
npm run build --prefix Frontend

# 3. Move Assets
echo "📂 Moving build assets to backend..."
mkdir -p backend/dist
rm -rf backend/dist/*
cp -r Frontend/dist/. backend/dist/

echo "✅ Build Complete! The app is ready to run."
