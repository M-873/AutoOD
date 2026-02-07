# AutoOD Render Deployment Script (PowerShell Version)
# This script prepares AutoOD for deployment to Render

Write-Host "🚀 Starting AutoOD deployment preparation..." -ForegroundColor Green

# Step 1: Verify we're in the correct directory
if (-not (Test-Path "render.yaml")) {
    Write-Host "❌ Error: render.yaml not found. Are you in the AutoOD-main directory?" -ForegroundColor Red
    exit 1
}

# Step 2: Check if git is available
try {
    git --version | Out-Null
    Write-Host "✅ Git is available" -ForegroundColor Green
} catch {
    Write-Host "❌ Git is not available. Please install Git first." -ForegroundColor Red
    exit 1
}

# Step 3: Check if git is initialized
if (-not (Test-Path ".git")) {
    Write-Host "📁 Initializing git repository..." -ForegroundColor Yellow
    git init
}

# Step 4: Add all changes to git
Write-Host "📦 Adding changes to git..." -ForegroundColor Yellow
git add .
git add --force backend/requirements_render.txt
git add --force backend/main_render.py
git add --force render.yaml
git add --force build.sh

# Step 5: Check if there are changes to commit
$status = git status --porcelain
if ($status) {
    Write-Host "💾 Committing changes..." -ForegroundColor Yellow
    git commit -m "Deploy AutoOD to Render with optimized configuration

- Updated requirements_render.txt with CPU-only dependencies
- Created main_render.py with YOLO-only models for resource optimization
- Configured render.yaml with 2GB disk and optimized settings
- Updated build.sh for Render deployment"
} else {
    Write-Host "ℹ️ No changes to commit" -ForegroundColor Cyan
}

# Step 6: Check if remote exists
try {
    $remoteUrl = git remote get-url origin 2>$null
    if ($remoteUrl) {
        Write-Host "🔄 Pushing to existing remote: $remoteUrl" -ForegroundColor Yellow
        git push origin main
    } else {
        Write-Host "📋 To complete deployment:" -ForegroundColor Cyan
        Write-Host "1. Create a new repository on GitHub/GitLab" -ForegroundColor White
        Write-Host "2. Add your remote: git remote add origin <your-repo-url>" -ForegroundColor White
        Write-Host "3. Push: git push -u origin main" -ForegroundColor White
        Write-Host "4. Connect the repo to Render dashboard" -ForegroundColor White
    }
} catch {
    Write-Host "📋 To complete deployment:" -ForegroundColor Cyan
    Write-Host "1. Create a new repository on GitHub/GitLab" -ForegroundColor White
    Write-Host "2. Add your remote: git remote add origin <your-repo-url>" -ForegroundColor White
    Write-Host "3. Push: git push -u origin main" -ForegroundColor White
    Write-Host "4. Connect the repo to Render dashboard" -ForegroundColor White
}

Write-Host "✅ Deployment preparation complete!" -ForegroundColor Green
Write-Host "📋 Next steps:" -ForegroundColor Cyan
Write-Host "1. Check Render dashboard for deployment status" -ForegroundColor White
Write-Host "2. Monitor logs for any startup issues" -ForegroundColor White
Write-Host "3. Test API endpoints once deployment is complete" -ForegroundColor White
Write-Host "4. Service URL: https://autood.onrender.com" -ForegroundColor White

Write-Host "🎯 Deployment script finished!" -ForegroundColor Green