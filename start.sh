#!/bin/bash
export LD_LIBRARY_PATH=$PYTHON_LD_LIBRARY_PATH:$LD_LIBRARY_PATH

# Check if the frontend build exists
if [ ! -d "backend/dist" ] || [ -z "$(ls -A backend/dist)" ]; then
    echo "⚠️  Frontend build missing or empty."
    echo "🚀 Initiating First-Time Build process..."
    
    # Run the build script
    bash build.sh
    
    if [ $? -ne 0 ]; then
        echo "❌ Build failed! Please check the logs."
        exit 1
    fi
else
    echo "✅ Frontend build found. Skipping build step."
fi

echo "🚀 Starting AutoOD Server..."
cd backend
python main.py
