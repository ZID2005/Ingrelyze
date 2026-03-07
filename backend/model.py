import pandas as pd
import joblib

from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report

from config import (
    MODEL_PATH,
    RANDOM_SEED,
    N_ESTIMATORS,
    CLASS_WEIGHT,
    TEST_SIZE,
    FEATURES,
    TARGET
)


class HealthClassifier:
    def __init__(self):
        self.model = RandomForestClassifier(
            n_estimators=N_ESTIMATORS,
            random_state=RANDOM_SEED,
            class_weight=CLASS_WEIGHT
        )
        self.features = FEATURES
        self.target = TARGET

    def train(self, data_path):
        """
        Trains the model and saves it to disk.
        Returns evaluation metrics.
        """
        print(f"Loading data from {data_path}...")
        df = pd.read_csv(data_path)

        # Filter out NaN values from Target
        df = df.dropna(subset=[self.target])
        
        X = df[self.features]
        y = df[self.target]

        # 🔧 FIX: merge rare class (4 → 3)
        if 4 in y.value_counts() and y.value_counts()[4] < 2:
            print("Merging rare class 4 into class 3 for stable training...")
            y = y.replace({4: 3})

        X_train, X_test, y_train, y_test = train_test_split(
            X,
            y,
            test_size=TEST_SIZE,
            random_state=RANDOM_SEED,
            stratify=y
        )

        print("Training Random Forest Classifier...")
        self.model.fit(X_train, y_train)

        print("Evaluating model...")
        y_pred = self.model.predict(X_test)
        accuracy = accuracy_score(y_test, y_pred)
        report = classification_report(y_test, y_pred, output_dict=True)

        print(f"Saving model to {MODEL_PATH}...")
        joblib.dump(self.model, MODEL_PATH)

        return {
            "accuracy": accuracy,
            "report": report
        }

    def load(self):
        """Load trained model from disk."""
        self.model = joblib.load(MODEL_PATH)
        print("Model loaded successfully.")

    def predict(self, input_features):
        """
        Predict health level for one food item.
        """
        if isinstance(input_features, dict):
            input_df = pd.DataFrame([input_features])
        else:
            input_df = input_features

        input_df = input_df[self.features]

        prediction = int(self.model.predict(input_df)[0])
        probabilities = self.model.predict_proba(input_df)[0]

        return prediction, probabilities
