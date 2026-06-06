#!/bin/bash
# Start script for AutoOD on Render

echo "🚀 Starting AutoOD Application..."

# Create torch cache directory on persistent disk
mkdir -p /opt/data/torch

# Set Python path to include backend directory
export PYTHONPATH="${PYTHONPATH}:$(pwd)"

# Navigate to backend directory
cd backend

# Start the application with uvicorn
echo "🔥 Starting FastAPI application with Uvicorn..."
uvicorn main_render:app \
  --host 0.0.0.0 \
  --port ${PORT:-10000} \
  --workers 1 \
  --limit-concurrency 10