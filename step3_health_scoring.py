import pandas as pd
import numpy as np
import os

print("🧮 Phase 1 – Step 3: Nutrition scoring & health labeling")

# -----------------------------
# LOAD CLEAN DATASET
# -----------------------------
DATA_PATH = "data/food_base_clean.csv"
df = pd.read_csv(DATA_PATH)

print("✅ Clean dataset loaded")

# -----------------------------
# HANDLE SAFETY (ensure no negatives)
# -----------------------------
numeric_cols = df.select_dtypes(include="number").columns
df[numeric_cols] = df[numeric_cols].clip(lower=0)

# -----------------------------
# COMPUTE HEALTH SCORE
# -----------------------------
df["health_score"] = (
    df["protein"] * 1.5
    + df["dietary_fiber"] * 2
    - df["sugars"] * 2
    - df["saturated_fats"] * 2
    - df["sodium"] * 0.01
    - df["cholesterol"] * 0.01
)

print("🧠 Health score calculated")

# -----------------------------
# NORMALIZE SCORE (0–100)
# -----------------------------
min_score = df["health_score"].min()
max_score = df["health_score"].max()

df["health_score_norm"] = (
    (df["health_score"] - min_score) / (max_score - min_score) * 100
)

# -----------------------------
# CREATE 5 HEALTH LEVELS
# -----------------------------
df["health_level"] = pd.cut(
    df["health_score_norm"],
    bins=[-1, 20, 40, 60, 80, 100],
    labels=[4, 3, 2, 1, 0]
).astype(int)

print("🏷️ Health levels assigned (0–4)")

# -----------------------------
# FINAL CHECK
# -----------------------------
print("\n📊 Health Level Distribution:")
print(df["health_level"].value_counts().sort_index())

# -----------------------------
# SAVE LABELED DATASET
# -----------------------------
output_path = "data/food_labeled.csv"
df.to_csv(output_path, index=False)

print(f"\n💾 Labeled dataset saved as: {output_path}")
print("✅ Phase 1 – Step 3 completed successfully")
