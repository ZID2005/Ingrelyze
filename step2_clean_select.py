import pandas as pd
import os

print("🧹 Phase 1 – Step 2: Cleaning & selecting features")

# -----------------------------
# LOAD MERGED DATA (FROM STEP 1 LOGIC)
# -----------------------------
DATA_DIR = "data"

files = [
    "FOOD-DATA-GROUP1.csv",
    "FOOD-DATA-GROUP2.csv",
    "FOOD-DATA-GROUP3.csv",
    "FOOD-DATA-GROUP4.csv",
    "FOOD-DATA-GROUP5.csv"
]

dfs = []
for file in files:
    df = pd.read_csv(os.path.join(DATA_DIR, file))
    dfs.append(df)

df = pd.concat(dfs, ignore_index=True)

print("✅ Dataset loaded")

# -----------------------------
# REMOVE USELESS COLUMNS
# -----------------------------
df = df.loc[:, ~df.columns.str.contains("^Unnamed")]

print("🗑️ Removed unnamed index columns")

# -----------------------------
# STANDARDIZE COLUMN NAMES
# -----------------------------
df.columns = (
    df.columns
    .str.strip()
    .str.lower()
    .str.replace(" ", "_")
    .str.replace("(", "", regex=False)
    .str.replace(")", "", regex=False)
)

print("✏️ Column names standardized")

# -----------------------------
# SELECT REQUIRED FEATURES
# -----------------------------
selected_columns = [
    "food",
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

# Keep only columns that exist (safe check)
selected_columns = [col for col in selected_columns if col in df.columns]
df = df[selected_columns]

print("🎯 Selected nutrition-relevant columns")

# -----------------------------
# FINAL CHECK
# -----------------------------
print("\n📊 Final Dataset Shape:")
print(df.shape)

print("\n📋 Final Columns:")
print(df.columns.tolist())

# -----------------------------
# SAVE CLEAN DATASET
# -----------------------------
output_path = os.path.join(DATA_DIR, "food_base_clean.csv")
df.to_csv(output_path, index=False)

print(f"\n💾 Clean dataset saved as: {output_path}")
print("✅ Phase 1 – Step 2 completed successfully")
