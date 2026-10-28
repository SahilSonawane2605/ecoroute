"""
ML inference service for ECO-ROUTE.
Loads the fine-tuned MobileNetV3-Small checkpoint trained on RealWaste.
Analyzes input image for:
1. Waste material category (Plastic, Cardboard, Metal, etc.)
2. Confidence score and full probability distribution
3. Visible waste extent estimation (heuristic contour/variance analysis on input image)
"""

import os
import json
import torch
import torch.nn as nn
from torchvision import transforms, models
from PIL import Image
import numpy as np
from typing import Dict, Any, List

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WEIGHTS_PATH = os.path.join(ROOT_DIR, "ml", "weights", "realwaste_mobilenetv3.pth")
METRICS_PATH = os.path.join(ROOT_DIR, "ml", "weights", "model_metrics.json")
MODEL_VERSION = "mobilenetv3_small-realwaste-v1.1"

_MODEL = None
_CLASSES = []
_DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

_TRANSFORM = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
])

def load_model():
    global _MODEL, _CLASSES
    if _MODEL is not None:
        return _MODEL, _CLASSES

    if not os.path.exists(WEIGHTS_PATH):
        raise FileNotFoundError(f"Model checkpoint not found at {WEIGHTS_PATH}. Please run training first.")

    checkpoint = torch.load(WEIGHTS_PATH, map_location=_DEVICE)
    _CLASSES = checkpoint.get("classes", [
        "Cardboard", "Food Organics", "Glass", "Metal", 
        "Miscellaneous Trash", "Paper", "Plastic", "Textile Trash", "Vegetation"
    ])
    
    model = models.mobilenet_v3_small(weights=None)
    in_features = model.classifier[3].in_features
    model.classifier[3] = nn.Linear(in_features, len(_CLASSES))
    model.load_state_dict(checkpoint["state_dict"])
    model.to(_DEVICE)
    model.eval()
    _MODEL = model
    print(f"Loaded trained RealWaste model with {len(_CLASSES)} classes on {_DEVICE}")
    return _MODEL, _CLASSES

def estimate_waste_extent(img: Image.Image) -> float:
    """
    Estimates visible waste extent / area coverage percentage.
    Analyzes local contrast variance across 16x16 grid patches.
    Returns estimated coverage percentage between 10.0% and 90.0%.
    """
    try:
        thumb = img.convert("L").resize((128, 128))
        arr = np.array(thumb, dtype=np.float32)
        
        patch_size = 16
        active_patches = 0
        total_patches = (128 // patch_size) ** 2
        
        for i in range(0, 128, patch_size):
            for j in range(0, 128, patch_size):
                patch = arr[i:i+patch_size, j:j+patch_size]
                if np.std(patch) > 22.0:
                    active_patches += 1
                    
        ratio = active_patches / total_patches
        extent = max(10.0, min(90.0, round(ratio * 100.0, 1)))
        return extent
    except Exception:
        return 40.0

def predict_image(image_path: str) -> Dict[str, Any]:
    """
    Runs classification and extent estimation on the given image path.
    Returns honest error status if model cannot process the image.
    """
    if not os.path.exists(image_path):
        return {
            "category": "Unknown",
            "confidence": 0.0,
            "all_predictions": [],
            "extent_coverage": 0.0,
            "model_version": MODEL_VERSION,
            "status": "error_file_not_found"
        }

    try:
        model, classes = load_model()
        image = Image.open(image_path).convert("RGB")
        tensor = _TRANSFORM(image).unsqueeze(0).to(_DEVICE)

        with torch.no_grad():
            outputs = model(tensor)
            probs = torch.softmax(outputs, dim=1)[0].cpu().numpy()

        pred_idx = int(np.argmax(probs))
        pred_class = classes[pred_idx]
        confidence = float(probs[pred_idx])

        all_predictions = [
            {"category": classes[i], "probability": round(float(probs[i]), 4)}
            for i in np.argsort(-probs)
        ]

        extent_coverage = estimate_waste_extent(image)

        return {
            "category": pred_class,
            "confidence": round(confidence, 4),
            "all_predictions": all_predictions,
            "extent_coverage": extent_coverage,
            "model_version": MODEL_VERSION,
            "status": "completed"
        }
    except Exception as e:
        print("ML Prediction Error:", str(e))
        return {
            "category": "Unclassified",
            "confidence": 0.0,
            "all_predictions": [],
            "extent_coverage": 0.0,
            "model_version": MODEL_VERSION,
            "status": f"inference_error: {str(e)}"
        }

def get_model_info() -> Dict[str, Any]:
    """Returns metadata and evaluation metrics about the currently deployed model."""
    if os.path.exists(METRICS_PATH):
        with open(METRICS_PATH, "r") as f:
            return json.load(f)
    return {
        "architecture": "MobileNetV3-Small",
        "status": "pending_training",
        "classes": []
    }
