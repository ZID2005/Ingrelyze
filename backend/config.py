import os
from dotenv import load_dotenv

load_dotenv()

# API Keys
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")

# Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(os.path.dirname(BASE_DIR), "data")
MODEL_PATH = os.path.join(BASE_DIR, "model.joblib")
DATA_PATH = os.path.join(DATA_DIR, "food_labeled.csv")

# Model Configuration
RANDOM_SEED = 42
TEST_SIZE = 0.2
N_ESTIMATORS = 100
CLASS_WEIGHT = "balanced"

# Features to use for training
FEATURES = [
    "caloric_value",
    "fat",
    "saturated_fats",
    "monounsaturated_fats",
    "polyunsaturated_fats",
    "carbohydrates",
    "sugars",
    "protein",
    "dietary_fiber",
    "cholesterol",
    "sodium",
    "nutrition_density"
]

# Target Variable
TARGET = "health_level"

# Health Level Mapping (0 is healthiest, 4 is least healthy)
HEALTH_LEVEL_MAP = {
    0: "Very Healthy",
    1: "Healthy",
    2: "Moderate",
    3: "Unhealthy",
    4: "Very Unhealthy"
}
