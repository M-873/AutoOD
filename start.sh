#!/bin/bash
# Start script for AutoOD on Render

echo "🚀 Starting AutoOD Application..."

# Create torch cache directory on persistent disk
mkdir -p /opt/data/torch

# Set Python path to include backend directory
export PYTHONPATH="${PYTHONPATH}:$(pwd)"

# Navigate to backend directory
cd backend

# Start the application with gunicorn
echo "🔥 Starting FastAPI application with Gunicorn..."
gunicorn main_render:app \
  -w 2 \
  -k uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:${PORT:-10000} \
  --timeout 120 \
  --keep-alive 5 \
  --max-requests 1000 \
  --max-requests-jitter 50