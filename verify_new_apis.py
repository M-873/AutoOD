import os
import sys
import json
import numpy as np
import cv2
from fastapi.testclient import TestClient
from dotenv import load_dotenv

# Add backend to sys.path to allow imports
sys.path.append(os.path.join(os.path.dirname(__file__), "backend"))

# Load env vars
load_dotenv(os.path.join(os.path.dirname(__file__), "backend", ".env"))

from main_render import app

def run_tests():
    print("----------------------------------------")
    print("🧪 Running End-to-End API Verification...")
    print("----------------------------------------")
    
    # Set mock CLEANUP_API_KEY if not exists
    if not os.environ.get("CLEANUP_API_KEY"):
        os.environ["CLEANUP_API_KEY"] = "test-cleanup-key-12345"
        print("Note: CLEANUP_API_KEY was not set, configured to mock 'test-cleanup-key-12345'")
        
    cleanup_key = os.environ.get("CLEANUP_API_KEY")

    # Generate dummy image bytes
    img = np.zeros((200, 200, 3), dtype=np.uint8)
    cv2.putText(img, "API Test", (20, 100), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
    _, buffer = cv2.imencode('.png', img)
    img_bytes = buffer.tobytes()

    with TestClient(app) as client:
        # 1. Test POST /api/images/upload
        print("\n1. Testing Image Upload (POST /api/images/upload)...")
        files = {"file": ("test_image.png", img_bytes, "image/png")}
        response = client.post("/api/images/upload", files=files)
        assert response.status_code == 200, f"Upload failed: {response.text}"
        img_data = response.json()
        assert "_id" in img_data, "Response missing '_id'"
        assert "imageUrl" in img_data, "Response missing 'imageUrl'"
        assert "thumbnailUrl" in img_data, "Response missing 'thumbnailUrl'"
        assert img_data["annotationCount"] == 0, "Initial annotationCount should be 0"
        image_id = img_data["_id"]
        print(f"✅ Success! Image uploaded with ID: {image_id}")
        print(f"   Image URL: {img_data['imageUrl']}")
        print(f"   Thumbnail URL: {img_data['thumbnailUrl']}")

        # 2. Test GET /api/images
        print("\n2. Testing Fetch Gallery List (GET /api/images)...")
        response = client.get("/api/images?page=1&limit=5")
        assert response.status_code == 200, f"Fetch gallery failed: {response.text}"
        gallery_data = response.json()
        assert "images" in gallery_data, "Response missing 'images'"
        assert "pagination" in gallery_data, "Response missing 'pagination'"
        assert len(gallery_data["images"]) >= 1, "Gallery list should contain at least 1 image"
        print(f"✅ Success! Found {len(gallery_data['images'])} images in gallery.")

        # 3. Test GET /api/images/{id}
        print(f"\n3. Testing Fetch Image Detail (GET /api/images/{image_id})...")
        response = client.get(f"/api/images/{image_id}")
        assert response.status_code == 200, f"Fetch detail failed: {response.text}"
        detail_data = response.json()
        assert detail_data["_id"] == image_id, "Detail ID does not match"
        print(f"✅ Success! Fetched detail for image {image_id}")

        # 4. Test PUT /api/images/{id}/annotations
        print(f"\n4. Testing Update Annotations (PUT /api/images/{image_id}/annotations)...")
        test_annotations = [
            {
                "label": "Car",
                "points": [10, 20, 110, 120],
                "color": "#3B82F6"
            },
            {
                "label": "Person",
                "points": [50, 60, 80, 180],
                "color": "#10B981"
            }
        ]
        response = client.put(f"/api/images/{image_id}/annotations", json={"annotations": test_annotations})
        assert response.status_code == 200, f"Update annotations failed: {response.text}"
        updated_data = response.json()
        assert updated_data["annotationCount"] == 2, f"Annotation count mismatch, expected 2 got {updated_data['annotationCount']}"
        assert len(updated_data["annotations"]) == 2, "Annotations list length mismatch"
        assert updated_data["annotations"][0]["label"] == "Car", "First annotation label mismatch"
        print(f"✅ Success! Added 2 annotations to image {image_id}")

        # 5. Test GET /health
        print("\n5. Testing Health Endpoint (GET /health)...")
        response = client.get("/health")
        assert response.status_code == 200, f"Health check failed: {response.text}"
        health_data = response.json()
        assert health_data["status"] == "healthy", "Health status not healthy"
        print("✅ Success! Health endpoint is operational.")

        # 6. Test GET /api/health (New MongoDB/Cloudinary verification)
        print("\n6. Testing Extended Health Check (GET /api/health)...")
        response = client.get("/api/health")
        response = client.get("/api/health")
        assert response.status_code == 200, f"Extended health check failed: {response.text}"
        ext_health = response.json()
        print(f"✅ Success! Extended Health Status:")
        print(f"   MongoDB Status: {ext_health.get('mongodb')}")
        print(f"   Cloudinary Status: {ext_health.get('cloudinary')}")

        # 7. Test POST /api/cleanup Security & Execution
        print("\n7. Testing Protected Cleanup Endpoint (POST /api/cleanup)...")
        # Without key
        response = client.post("/api/cleanup")
        assert response.status_code == 401, f"Expected 401 Unauthorized, got {response.status_code}"
        print("✅ Success! Deployed key protection rejects empty header.")
        
        # With wrong key
        response = client.post("/api/cleanup", headers={"x-api-key": "wrong-key"})
        assert response.status_code == 401, f"Expected 401 Unauthorized, got {response.status_code}"
        print("✅ Success! Deployed key protection rejects invalid key.")
        
        # With valid key
        response = client.post("/api/cleanup", headers={"x-api-key": cleanup_key})
        assert response.status_code == 200, f"Cleanup request failed: {response.text}"
        cleanup_data = response.json()
        assert cleanup_data["status"] == "success", "Cleanup status mismatch"
        print(f"✅ Success! Authenticated cleanup ran. Deleted {cleanup_data['deleted_count']} expired records.")

        # 8. Test DELETE /api/images/{id}
        print(f"\n8. Testing Image Deletion (DELETE /api/images/{image_id})...")
        response = client.delete(f"/api/images/{image_id}")
        assert response.status_code == 200, f"Deletion failed: {response.text}"
        print(f"✅ Success! Deleted test image {image_id}")

        # 9. Verify deletion detail returns 404
        response = client.get(f"/api/images/{image_id}")
        assert response.status_code == 404, f"Expected 404 for deleted image, got {response.status_code}"
        print("✅ Success! Deleted image is no longer accessible (returns 404).")

    print("\n----------------------------------------")
    print("🎉 ALL END-TO-END TESTS PASSED SUCCESSFULLY!")
    print("----------------------------------------")

if __name__ == "__main__":
    run_tests()
