from backend.model import HealthClassifier
from backend.config import DATA_PATH

import os

if __name__ == "__main__":
    classifier = HealthClassifier()
    
    if os.path.exists(DATA_PATH):
        print(f"Starting training with data at {DATA_PATH}...")
        metrics = classifier.train(DATA_PATH)
        print("Training completed.")
        print(f"Accuracy: {metrics['accuracy']:.4f}")
        print("Classification Report:")
        print(metrics['report'])
    else:
        print(f"Error: Data file not found at {DATA_PATH}")
