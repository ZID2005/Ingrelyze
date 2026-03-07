import pandas as pd
import os

print("🔄 Phase 1 – Step 1: Loading & inspecting Kaggle food dataset")

# Folder where CSV files are stored
DATA_DIR = "data"

files = [
    "FOOD-DATA-GROUP1.csv",
    "FOOD-DATA-GROUP2.csv",
    "FOOD-DATA-GROUP3.csv",
    "FOOD-DATA-GROUP4.csv",
    "FOOD-DATA-GROUP5.csv"
]

# Load all CSV files
dfs = []

for file in files:
    path = os.path.join(DATA_DIR, file)
    print(f"📂 Loading {file}...")
    df = pd.read_csv(path)
    dfs.append(df)

# Merge all files
df_all = pd.concat(dfs, ignore_index=True)

print("\n✅ All files loaded and merged")

# -----------------------------
# INSPECTION (NO CLEANING)
# -----------------------------
print("\n📊 Dataset Shape (rows, columns):")
print(df_all.shape)

print("\n📋 Column Names:")
for col in df_all.columns:
    print("-", col)

print("\n📑 Data Types:")
print(df_all.dtypes)

print("\n🔍 Sample Rows:")
print(df_all.head())

print("\n⚠️ Missing Values per Column:")
print(df_all.isnull().sum())

print("\n✅ Phase 1 - Step 1 completed successfully")
