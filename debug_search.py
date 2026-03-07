import pandas as pd
import difflib
import sys
import traceback

# Mock data path or use real one
DATA_PATH = "d:/Ingrelyze/data/food_labeled.csv"
# Actually let's just use the logic from api.py with a dummy dataframe first to see if logic is sound.

def search_food_debug(query, food_df):
    print(f"Searching for: {query}")
    lower_query = query.lower().strip()
    
    candidates = []
    
    try:
        # Vectorized operations
        mask_exact = food_df['food'].str.lower() == lower_query
        mask_starts = food_df['food'].str.lower().str.startswith(lower_query)
        mask_contains = food_df['food'].str.contains(query, case=False, na=False)

        # Collect matches
        exact_matches = food_df[mask_exact].copy()
        exact_matches['score'] = 4.0
        
        starts_matches = food_df[mask_starts & ~mask_exact].copy()
        starts_matches['score'] = 3.0
        
        contains_matches = food_df[mask_contains & ~mask_starts & ~mask_exact].copy()
        contains_matches['score'] = 2.0
        
        combined = pd.concat([exact_matches, starts_matches, contains_matches])
        
        # Fuzzy logic
        existing_indices = combined.index
        remaining_df = food_df.drop(existing_indices)
        
        if not remaining_df.empty:
            if len(lower_query) > 1:
                 heuristic_mask = remaining_df['food'].str.lower().str.startswith(lower_query[0])
                 fuzzy_candidates = remaining_df[heuristic_mask].copy()
                 if fuzzy_candidates.empty:
                     fuzzy_candidates = remaining_df.copy()
            else:
                 fuzzy_candidates = remaining_df.copy()

            if not fuzzy_candidates.empty:
                # Potential issue line?
                def safe_ratio(x):
                    try:
                        return difflib.SequenceMatcher(None, lower_query, str(x).lower()).ratio()
                    except Exception as e:
                        print(f"Error comparing {lower_query} with {x}: {e}")
                        return 0.0

                fuzzy_candidates['ratio'] = fuzzy_candidates['food'].apply(safe_ratio)
                
                fuzzy_matches = fuzzy_candidates[fuzzy_candidates['ratio'] >= 0.6].copy()
                fuzzy_matches['score'] = 1.0 + fuzzy_matches['ratio']
                
                combined = pd.concat([combined, fuzzy_matches])

        if combined.empty:
            return []

        combined['length'] = combined['food'].str.len()
        combined = combined.sort_values(by=['score', 'length', 'food'], ascending=[False, True, True])
        
        results = combined.head(5)
        return results.to_dict(orient="records")

    except Exception:
        traceback.print_exc()
        return []

if __name__ == "__main__":
    try:
        print(f"Loading data from {DATA_PATH}...")
        df = pd.read_csv(DATA_PATH)
        # Apply the fix I made in api.py to see if it works here
        if not df.empty and 'food' in df.columns:
            df = df.dropna(subset=['food'])
            df['food'] = df['food'].astype(str)
            print(f"Data loaded: {len(df)} rows.")
        else:
            print("Data empty or missing food column.")

        print("Testing 'pizza'...")
        res = search_food_debug("pizza", df)
        print(res)

        print("\nTesting 'chickn'...")
        res = search_food_debug("chickn", df)
        print(res)
    except Exception as e:
        print(f"Main block error: {e}")
        traceback.print_exc()
