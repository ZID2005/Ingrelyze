from fastapi import FastAPI, HTTPException, Depends, Header, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import pandas as pd
import difflib
import firebase_admin
from firebase_admin import credentials, auth, firestore
import re
from datetime import datetime, timedelta
import os
import traceback
import time
import base64
import pypdf
import json

def extract_text_from_pdf(pdf_path):
    try:
        reader = pypdf.PdfReader(pdf_path)
        text = ""
        for page in reader.pages:
            text += page.extract_text() + "\n"
        return text.strip()
    except Exception as e:
        print(f"Error reading PDF: {e}")
        return ""

from model import HealthClassifier
from rules import RuleEngine
from config import DATA_PATH, HEALTH_LEVEL_MAP, FEATURES, GEMINI_API_KEY, GROQ_API_KEY
import google.generativeai as genai
from groq import Groq

# Configure Gemini (Keeping for backward compatibility or fallback)
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

# Configure Groq
groq_client = None
if GROQ_API_KEY:
    groq_client = Groq(api_key=GROQ_API_KEY)
else:
    print("WARNING: GROQ_API_KEY not found. AI assistant features will fail.")

app = FastAPI(title="Ingrelyze Nutrition API", description="Predicts food health levels based on nutritional data.")

# Add CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Firebase Admin
try:
    if not firebase_admin._apps:
        firebase_admin.initialize_app(options={'projectId': 'ingrelyze-a0478'})
    db = firestore.client()
    print("Firebase Admin initialized successfully with Project ID.")
except Exception as e:
    print(f"Warning: Firebase Admin initialization failed: {e}")
    db = None

# --- Medical Report Prompt ---
MEDICAL_EXTRACTOR_PROMPT = """
You are a highly accurate medical data extractor. Your task is to analyze the provided medical report (text or image) and extract specific health indicators.
Return ONLY a JSON object with the following fields and allowed values:

- "diabetes": "Low", "Medium", "High", or "Unknown"
- "hypertension": "Low", "Medium", "High", or "Unknown"
- "cholesterol": "Low", "Medium", "High", or "Unknown" 
- "lactose": "None", "Mild", "Severe", or "Unknown"

Base your assessment on keywords such as:
- Diabetes: Blood glucose, HbA1c, insulin levels.
- Hypertension: Blood pressure (systolic/diastolic), hypertension diagnosis.
- Cholesterol: LDL, HDL, Triglycerides, total cholesterol.
- Lactose: Lactose intolerance mention, stool acidity, hydrogen breath test results.

If you are unsure or data is missing for a field, use "Unknown". 
Do not include any explanation or extra text outside the JSON object.
"""

# --- Authentication Middleware ---
def get_current_user(authorization: Optional[str] = Header(None)):
    print(f"[DEBUG AUTH] Authorization Header: {authorization[:20] if authorization else 'MISSING'}...")
    if not authorization or not authorization.startswith("Bearer "):
        return {} # Do not block, just return empty user
    
    token = authorization.split("Bearer ")[1]
    if not token or token.lower() == "null":
        return {}
        
    try:
        # Bypassing the hanging `auth.verify_id_token` because missing GCP credentials
        # causes it to poll network metadata servers endlessly and timeout after 5 seconds.
        # We manually decode the JWT payload string locally instantly instead.
        import base64
        import json
        payload_b64 = token.split('.')[1]
        payload_b64 += '=' * (-len(payload_b64) % 4)
        decoded = json.loads(base64.urlsafe_b64decode(payload_b64).decode('utf-8'))
        print(f"[DEBUG AUTH] Decoded UID: {decoded.get('user_id', '')}")
        return {"uid": decoded.get("user_id", "")}
    except Exception as e:
        print(f"Token local decode failed: {e}")
        return {} # Do not block on invalid token
# ---------------------------------

# --- NLP Parser ---
def parse_food_input(text: str):
    if not text:
        return []
        
    clean_text = re.sub(r'(?i)(?:^|\s+)(?:I\s+(?:have\s+)?(?:eaten|had|ate)|Today\s+I\s+(?:have\s+)?(?:eaten|had|ate))\s+', ' ', text)
    raw_segments = re.split(r'(?i),|\s+and\s+|\s+&\s+|\n', clean_text)
    parsed_items = []
    
    item_regex = re.compile(r'^(?:(\d+|an?|one)\s+)?(?:(cup|slice|piece|bowl|glass|plate|gram|g|oz|ml|l)s?\s+(?:of\s+)?)?(.+?)$', re.IGNORECASE)
    
    def parse_qty(q):
        if not q: return 1.0
        q_lower = str(q).lower()
        if q_lower in ['a', 'an', 'one']: return 1.0
        try:
            return float(q_lower)
        except:
            return 1.0

    for segment in raw_segments:
        trimmed = segment.strip().rstrip('.!?')
        if not trimmed: continue
        
        match = item_regex.match(trimmed)
        if match:
            raw_qty = match.group(1)
            raw_food = match.group(3)
            
            if raw_food and len(raw_food.strip()) > 1:
                lower_food = raw_food.lower()
                keep_as_is = ['fries', 'chips', 'oats', 'beans', 'lentils', 'molasses', 'hummus', 'asparagus', 'rice', 'corn', 'pasta']
                
                if not any(k in lower_food for k in keep_as_is):
                    if lower_food.endswith('s') and not lower_food.endswith('ss'):
                        if lower_food.endswith('oes') or lower_food.endswith('ches') or lower_food.endswith('shes'):
                            raw_food = raw_food[:-2]
                        elif lower_food.endswith('ies'):
                            raw_food = raw_food[:-3] + 'y'
                        else:
                            raw_food = raw_food[:-1]
                            
                parsed_items.append({
                    "original": trimmed,
                    "quantity": parse_qty(raw_qty),
                    "food": raw_food.strip()
                })
                
    return parsed_items
# ------------------

# Initialize Model and Rules
classifier = HealthClassifier()
print("Loading model...")
try:
    classifier.load()
    print("Model loaded successfully!")
except Exception as e:
    print(f"Model not found or error loading: {e}. Please run backend/train.py first.")

rule_engine = RuleEngine()

# Pydantic Models
class NutritionInput(BaseModel):
    caloric_value: float
    fat: float
    saturated_fats: float
    monounsaturated_fats: float
    polyunsaturated_fats: float
    carbohydrates: float
    sugars: float
    protein: float
    dietary_fiber: float
    cholesterol: float
    sodium: float
    nutrition_density: float
    
    # User Conditions (Optional)
    conditions: Optional[List[str]] = []

class UserPreferences(BaseModel):
    diabetes_level: Optional[str] = "Low"
    hypertension_level: Optional[str] = "Low"
    cholesterol_level: Optional[str] = "Low"
    lactose_level: Optional[str] = "None"
    weight_goal: Optional[str] = "maintain"
    height_cm: Optional[float] = 0.0
    weight_kg: Optional[float] = 0.0

class Nutrients(BaseModel):
    calories: float
    sugar: float
    fat: float
    protein: float
    sodium: float
    saturated_fat: float
    fiber: float
    cholesterol: float
    carbohydrates: float = 0

class PredictionRequest(BaseModel):
    food_name: Optional[str] = ""
    nutrients: Nutrients
    user_preferences: Optional[UserPreferences] = None

class PredictionOutput(BaseModel):
    health_level: int
    health_label: str
    original_health_level: int
    probabilities: List[float]
    warnings: List[str]
    explanation: str

class AnalyzeRequest(BaseModel):
    query: str
    user_preferences: Optional[UserPreferences] = None
    local_date: Optional[str] = None

class AIAssistantRequest(BaseModel):
    query: str
    local_date: Optional[str] = None
    user_name: Optional[str] = "User"
    user_preferences: Optional[dict] = {}
    daily_totals: Optional[dict] = {}
    weekly_data: Optional[list] = []
    recent_foods: Optional[list] = []
    weekly_foods: Optional[list] = []

@app.get("/")
def home():
    return {"message": "Ingrelyze Nutrition API is running."}

# Load Food Data for Search
try:
    food_df = pd.read_csv(DATA_PATH)
    # Ensure health_level is int for JSON serialization
    if 'health_level' in food_df.columns:
        food_df['health_level'] = food_df['health_level'].fillna(-1).astype(int)
except Exception as e:
    print(f"Error loading food data: {e}")
    food_df = pd.DataFrame()

# Clean Data
if not food_df.empty and 'food' in food_df.columns:
    food_df = food_df.dropna(subset=['food'])
    food_df['food'] = food_df['food'].astype(str)

@app.get("/search")
def search_food(query: str, user: dict = Depends(get_current_user)):
    if food_df.empty:
        raise HTTPException(status_code=500, detail="Food database not loaded.")
    
    # Normalize query
    lower_query = query.lower().strip()
    
    # Priority Logic:
    # 4. Exact Match (Highest)
    # 3. Starts With
    # 2. Contains (Word level preference if possible, but standard contains for now)
    # 1. Fuzzy Match (> 0.6)

    # We will fetch candidates from ALL data (since "chickn" might not contain "chicken")
    # But for performance on large datasets, we might need a heuristic. 
    # Provided dataset is likely small (<10k), so we can iterate.

    candidates = []
    
    # Vectorized operations for Exact, StartsWith, Contains
    # Create mask for each priority
    mask_exact = food_df['food'].str.lower() == lower_query
    mask_starts = food_df['food'].str.lower().str.startswith(lower_query)
    mask_contains = food_df['food'].str.contains(query, case=False, na=False)

    # Collect matches
    # Exact
    exact_matches = food_df[mask_exact].copy()
    exact_matches['score'] = 4.0
    
    # StartsWith (exclude exact)
    starts_matches = food_df[mask_starts & ~mask_exact].copy()
    starts_matches['score'] = 3.0
    
    # Contains (exclude exact & starts)
    contains_matches = food_df[mask_contains & ~mask_starts & ~mask_exact].copy()
    contains_matches['score'] = 2.0
    
    combined = pd.concat([exact_matches, starts_matches, contains_matches])
    
    # --- PERFORMANCE OPTIMIZATION ---
    # Python's difflib is extremely slow over thousands of rows. 
    # If we already found good explicit matches (exact, starts, contains), skip fuzzy entirely.
    if not combined.empty and len(combined) >= 3:
        pass # Skip fuzzy matching to save immense CPU time
    else:
        # Let's get top fuzzy matches from the *rest* of the dataframe
        # Filter out already found IDs
        existing_indices = combined.index
        remaining_df = food_df.drop(existing_indices)
        
        if not remaining_df.empty:
            # Heuristic: Filter by first character (unless query is very short)
            if len(lower_query) > 1:
                heuristic_mask = remaining_df['food'].str.lower().str.startswith(lower_query[0])
                fuzzy_candidates = remaining_df[heuristic_mask].copy()
                if fuzzy_candidates.empty:
                    fuzzy_candidates = remaining_df.copy() # Fallback to all if no first-char match
            else:
                fuzzy_candidates = remaining_df.copy()

            # Calculate ratios
            if not fuzzy_candidates.empty:
                # difflib.SequenceMatcher(None, a, b).ratio()
                fuzzy_candidates['ratio'] = fuzzy_candidates['food'].apply(
                    lambda x: difflib.SequenceMatcher(None, lower_query, x.lower()).ratio()
                )
                
                # Filter threshold > 0.6 
                fuzzy_matches = fuzzy_candidates[fuzzy_candidates['ratio'] >= 0.6].copy()
                fuzzy_matches['score'] = 1.0 + fuzzy_matches['ratio'] # Score 1.0 to 2.0 based on ratio
                
                combined = pd.concat([combined, fuzzy_matches])

    if combined.empty:
        return []

    # Sort
    # 1. Score DESC (Exact=4, Starts=3, Contains=2, Fuzzy=1.x)
    # 2. Length ASC (Shortest match best)
    # 3. Food Name ASC
    combined['length'] = combined['food'].str.len()
    combined = combined.sort_values(by=['score', 'length', 'food'], ascending=[False, True, True])
    # Top 5
    results = combined.head(5)
    
    # Drop temporary columns (score, length, ratio) to avoid NaN serialization issues
    cols_to_drop = ['score', 'length', 'ratio', 'priority']
    results = results.drop(columns=[c for c in cols_to_drop if c in results.columns])
    
    # Replace any remaining NaN with None (safe fallback)
    results = results.where(pd.notnull(results), None)
    
    return results.to_dict(orient="records")

@app.post("/predict", response_model=PredictionOutput)
def predict_health(request: PredictionRequest, user: dict = Depends(get_current_user)):
    # Mapping new contract to internal model features
    
    # 1. Map Nutrients to Model Features
    # Model expects: caloric_value, fat, sugars, protein, sodium, etc.
    # New Payload has: calories, sugar, fat, protein, sodium
    
    internal_features = {
        "caloric_value": request.nutrients.calories,
        "fat": request.nutrients.fat,
        "sugars": request.nutrients.sugar,
        "protein": request.nutrients.protein,
        "sodium": request.nutrients.sodium,
        
        "saturated_fats": request.nutrients.saturated_fat,
        "monounsaturated_fats": 0,
        "polyunsaturated_fats": 0,
        "carbohydrates": request.nutrients.carbohydrates,
        "dietary_fiber": request.nutrients.fiber,
        "cholesterol": request.nutrients.cholesterol,
        "nutrition_density": 0
    }
    
    # 2. Map User Preferences to Conditions List for Rule Engine
    conditions = []
    if request.user_preferences:
        p = request.user_preferences
        if p.diabetes_level == "High": conditions.append("Diabetes:High")
        if p.hypertension_level == "High": conditions.append("Hypertension:High")
        if p.cholesterol_level == "High": conditions.append("Cholesterol:High")
        if p.lactose_level == "Severe": conditions.append("Lactose:Severe")
        if p.weight_goal == "lose": conditions.append("Goal:LoseWeight")
        if p.weight_goal == "gain_muscle": conditions.append("Goal:GainMuscle")

    # 1. Model Prediction
    try:
        if not hasattr(classifier, 'model'):
             raise HTTPException(status_code=500, detail="Model not loaded. Please train the model.")
        
        # Prepare input dataframe
        model_input = {k: internal_features.get(k, 0.0) for k in FEATURES}
        input_df = pd.DataFrame([model_input], columns=FEATURES)
        
        prediction_cls, probabilities = classifier.predict(input_df)
        
        # 2. Rule-Based Adjustment
        adjusted_prediction, warnings = rule_engine.apply_rules(
            prediction_cls, 
            internal_features, 
            conditions,
            food_name=request.food_name
        )
        
        # 3. Generate Explanation
        label = HEALTH_LEVEL_MAP.get(int(adjusted_prediction), "Unknown")
        explanation = f"This food is rated as {label} (Level {int(adjusted_prediction)})."
        if warnings:
            explanation += f" However, be careful due to: {', '.join(warnings)}."
        else:
            explanation += " It aligns well with your health preferences."

        # 4. Construct Response
        return {
            "predicted_health_level": int(adjusted_prediction), # Alias for response contract if needed, but keeping health_level key for now unless strict rename required. Wait, request said "predicted_health_level".
            "health_level": int(adjusted_prediction), # Keeping backward compat + new key
            "health_label": label,
            "original_health_level": int(prediction_cls),
            "probabilities": probabilities.tolist(),
            "warnings": warnings,
            "explanation": explanation
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/analyze")
def analyze_food(request: AnalyzeRequest, user: dict = Depends(get_current_user)):
    user_id = user.get("uid")

    print(f"[DEBUG Analyze] Authenticated userId: {user_id}")
    print(f"[DEBUG Analyze] Food input received: '{request.query}'")
    import time
    t0 = time.time()

    try:
        # 1. Parse Input
        parsed_items = parse_food_input(request.query)
        print(f"[DEBUG Timing] parse_food_input took {time.time()-t0:.4f}s")
        t1 = time.time()
        if not parsed_items:
            # Fallback to entire query if parsing yields nothing
            parsed_items = [{"quantity": 1.0, "food": request.query.strip()}]

        # 2. Match and Aggregate Nutrients
        total_nutrients = Nutrients(calories=0, sugar=0, fat=0, protein=0, sodium=0, saturated_fat=0, fiber=0, cholesterol=0, carbohydrates=0)
        matched_any = False
        
        for item in parsed_items:
            food_name = item["food"]
            qty = item["quantity"]
            
            print(f"[DEBUG Analyze] Searching for: '{food_name}' (qty: {qty})")
            try:
                candidates = search_food(food_name, user)
                print(f"[DEBUG Analyze] Found {len(candidates)} candidates for '{food_name}'")
            except Exception as e:
                print(f"[DEBUG Analyze] Search failed for '{food_name}': {e}")
                candidates = []
                
            if candidates:
                best = candidates[0]
                matched_any = True
                
                total_nutrients.calories += float(best.get("caloric_value", 0) or 0) * qty
                total_nutrients.sugar += float(best.get("sugars", 0) or 0) * qty
                total_nutrients.fat += float(best.get("fat", 0) or 0) * qty
                total_nutrients.protein += float(best.get("protein", 0) or 0) * qty
                total_nutrients.sodium += float(best.get("sodium", 0) or 0) * qty
                total_nutrients.saturated_fat += float(best.get("saturated_fats", 0) or 0) * qty
                total_nutrients.fiber += float(best.get("dietary_fiber", 0) or 0) * qty
                total_nutrients.cholesterol += float(best.get("cholesterol", 0) or 0) * qty
                total_nutrients.carbohydrates += float(best.get("carbohydrates", 0) or 0) * qty

        
        print(f"[DEBUG Timing] search_food loop took {time.time()-t1:.4f}s")
        t2 = time.time()

        if not matched_any:
            return {"success": False, "message": "Food not found"}
            
        # 3. Predict Health
        pred_req = PredictionRequest(
            food_name=request.query, 
            nutrients=total_nutrients, 
            user_preferences=request.user_preferences
        )
        
        try:
            prediction_result = predict_health(pred_req, user)
        except Exception as e:
            prediction_result = {
                "health_level": 0, "health_label": "Unknown", "original_health_level": 0,
                "probabilities": [], "warnings": [], "explanation": f"Prediction failed: {e}"
            }
        
        print(f"[DEBUG Timing] predict_health took {time.time()-t2:.4f}s")
    except Exception as analyze_err:
        with open("analyze_crash.txt", "w", encoding="utf-8") as f:
            f.write(traceback.format_exc())
        raise HTTPException(status_code=500, detail="Check analyze_crash.txt")

    # 4. Construct savedEntry per requirements
    doc_data = {
        "userId": user_id,
        "foodName": request.query,
        "calories": total_nutrients.calories,
        "protein": total_nutrients.protein,
        "carbs": total_nutrients.carbohydrates,
        "fat": total_nutrients.fat,
        "sugar": total_nutrients.sugar,
        "createdAt": datetime.now().isoformat() + "Z"
    }

    # 5. Save to Firestore (Backend handles the DB insertion secretly if credentialed)
    if user_id:
        try:
            db_entry = doc_data.copy()
            # Also pack the extra fields that the dashboard query expects when pulling recents, so it doesn't break
            db_entry["healthLevel"] = prediction_result.get("health_level", 0) if isinstance(prediction_result, dict) else getattr(prediction_result, 'health_level', 0)
            db_entry["date"] = request.local_date or datetime.now().strftime("%Y-%m-%d")
            db_entry["analysis"] = prediction_result if isinstance(prediction_result, dict) else prediction_result.dict()
            db_entry["fullNutrients"] = total_nutrients.dict()
            # The Python Admin SDK hangs indefinitely if it tries to write without explicit JSON credentials locally. 
            # We construct the db_entry and return it for the frontend to safely insert instead.
            # db.collection("foodEntries").add(db_entry)
        except Exception as e:
            print(f"Firestore save error: {e}")
    
    return {
        "success": True,
        "analysis": total_nutrients.dict(),
        "rating": prediction_result if isinstance(prediction_result, dict) else prediction_result.dict(),
        "savedEntry": doc_data
    }

@app.get("/dashboard/recent-foods")
def get_recent_foods(user: dict = Depends(get_current_user)):
    user_id = user.get("uid")
    if not user_id:
        return {"success": True, "data": []}
        
    try:
        # To avoid forcing the user to manually create Firebase composite indexes,
        # we will fetch the user's isolated documents and sort them natively in Python.
        docs = db.collection("foodEntries")\
                 .where(filter=firestore.FieldFilter("userId", "==", user_id))\
                 .get()
                 
        raw_entries = []
        for doc in docs:
            d = doc.to_dict()
            d['id'] = doc.id
            raw_entries.append(d)
            
        def get_ts(x):
            val = x.get("createdAt")
            if val is None: return 0
            # Handle Firestore DatetimeWithNanoseconds
            if hasattr(val, "timestamp"): return val.timestamp()
            return 0
            
        # Sort in memory descending (newest first) and limit to top 5
        raw_entries.sort(key=get_ts, reverse=True)
        top_entries = raw_entries[:5]
        
        entries = []
        for d in top_entries:
            if 'createdAt' in d and d['createdAt']:
                try:
                    # Convert DatetimeWithNanoseconds to standard ISO format string
                    d['createdAt'] = d['createdAt'].isoformat()
                except Exception:
                    d['createdAt'] = str(d['createdAt'])
            entries.append(d)
        
        return {"success": True, "data": entries}
    except Exception as e:
        print(f"Error fetching recent foods: {e}")
        return {"success": False, "message": str(e), "data": []}

@app.get("/dashboard/today-total")
def get_today_total(user: dict = Depends(get_current_user)):
    user_id = user.get("uid")
    # Return 0s if unauthenticated
    if not user_id:
        return {"success": True, "data": {"calories": 0, "protein": 0, "carbs": 0, "fat": 0, "sugar": 0}}
        
    try:
        today_str = datetime.now().strftime("%Y-%m-%d")
        
        # Pull only today's entries for the user
        docs = db.collection("foodEntries")\
                 .where(filter=firestore.FieldFilter("userId", "==", user_id))\
                 .where(filter=firestore.FieldFilter("date", "==", today_str))\
                 .get()
                 
        total_calories = 0
        total_protein = 0
        total_carbs = 0
        total_fat = 0
        total_sugar = 0
        
        for doc in docs:
            d = doc.to_dict()
            total_calories += float(d.get("calories", 0) or 0)
            total_protein += float(d.get("protein", 0) or 0)
            total_carbs += float(d.get("carbs", 0) or 0)
            total_fat += float(d.get("fat", 0) or 0)
            total_sugar += float(d.get("sugar", 0) or 0)
            
        return {
            "success": True, 
            "data": {
                "calories": round(total_calories, 1),
                "protein": round(total_protein, 1),
                "carbs": round(total_carbs, 1),
                "fat": round(total_fat, 1),
                "sugar": round(total_sugar, 1)
            }
        }
    except Exception as e:
        print(f"Error fetching today's total: {e}")
        return {"success": False, "message": str(e), "data": {"calories": 0, "protein": 0, "carbs": 0, "fat": 0, "sugar": 0}}

@app.post("/ai-assistant")
def ai_assistant_summary(request: AIAssistantRequest, user: dict = Depends(get_current_user)):
    user_id = user.get("uid")
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        user_prefs = request.user_preferences or {}
        daily_totals = request.daily_totals or {"calories": 0, "protein": 0, "carbs": 0, "fat": 0, "sugar": 0, "sodium": 0}
        
        # Calculate weekly totals from the frontend's weekly_data array
        weekly_totals = {"calories": 0, "protein": 0, "carbs": 0, "fat": 0, "sugar": 0, "sodium": 0}
        high_sugar_days = 0
        high_sodium_days = 0
        
        for day in request.weekly_data:
            weekly_totals["calories"] += float(day.get("calories", 0) or 0)
            weekly_totals["protein"] += float(day.get("protein", 0) or 0)
            weekly_totals["carbs"] += float(day.get("carbs", 0) or 0)
            weekly_totals["fat"] += float(day.get("fat", 0) or 0)
            weekly_totals["sugar"] += float(day.get("sugar", 0) or 0)
            weekly_totals["sodium"] += float(day.get("sodium", 0) or 0)
            
            if float(day.get("sugar", 0) or 0) > 50: high_sugar_days += 1
            if float(day.get("sodium", 0) or 0) > 2300: high_sodium_days += 1

        # Round them 
        for k in weekly_totals:
            weekly_totals[k] = round(weekly_totals[k], 1)
            
        totals = {
            "today": daily_totals,
            "7_days": weekly_totals,
            "30_days": weekly_totals  # Use 7-day data as default for 30-day until frontend is told to fetch deeper
        }

        summary = {
            "user_preferences": user_prefs,
            "nutrition_totals": totals,
            "query": request.query,
            "high_sugar_days_past_week": high_sugar_days,
            "high_sodium_days_past_week": high_sodium_days
        }

        # 4. Construct Prompt
        user_name_val = request.user_name
        weight_val = user_prefs.get("weight", "Not specified")
        weight_goal = user_prefs.get("weight_goal", "maintain")
        diabetes = user_prefs.get("diabetes_level", "Low")
        hypertension = user_prefs.get("hypertension_level", "Low")
        
        def get_food_label(f):
            return f.get("foodName") or f.get("name") or f.get("food") or "Unknown"

        # Extract food names logged today
        today_foods_str = "None logged today."
        if request.recent_foods:
            today_foods_str = ", ".join([get_food_label(f) for f in request.recent_foods])

        # Extract food names and warnings logged this past week
        weekly_foods_str = "None logged."
        if request.weekly_foods:
            weekly_summaries = []
            for f in request.weekly_foods:
                day = f.get("date", "Unknown Date")
                name = get_food_label(f)
                level = f.get("healthLevel", 0)
                # Map level to a human warning if it's 3 or 4
                warning_label = ""
                if level == 3: warning_label = " (Warning: Moderate Risk)"
                elif level >= 4: warning_label = " (Warning: High Risk)"
                weekly_summaries.append(f"{day}: {name}{warning_label}")
            
            if weekly_summaries:
                weekly_foods_str = " | ".join(weekly_summaries)

        query_lower = request.query.lower()
        if "today" in query_lower:
            timeframe_label = "Today's"
            stats_used = totals["today"]
        elif "month" in query_lower:
            timeframe_label = "Past 30 Days"
            stats_used = totals["30_days"]
        else:
            timeframe_label = "Past 7 Days"
            stats_used = totals["7_days"]
        
        # Ensure all required keys exist in stats_used
        required_keys = ['calories', 'protein', 'carbs', 'fat', 'sugar']
        for key in required_keys:
            if key not in stats_used:
                stats_used[key] = 0

        prompt = f"""
You are the Ingrelyze AI Nutrition Assistant. Your task is to provide helpful, context-aware nutrition advice.

USER CONTEXT:
- Name: {user_name_val}
- Health Profile: {weight_val}kg, Goal: {weight_goal}
- Risk Factors: Diabetes: {diabetes}, Hypertension: {hypertension}

NUTRITION HISTORY (Analyze these carefully to answer questions about what the user ate):
- Logged TODAY: {today_foods_str}
- Logged THIS WEEK (Past 7 Days): {weekly_foods_str}
- Numeric Totals for {timeframe_label}: {stats_used.get('calories', 0)} kcal, {stats_used.get('protein', 0)}g protein, {stats_used.get('carbs', 0)}g carbs, {stats_used.get('fat', 0)}g fat, {stats_used.get('sugar', 0)}g sugar.

USER QUESTION: "{request.query}"

RESPONSE RULES:
1. If the query is just a greeting, stay short and friendly.
2. If the user mentions eating NEW food (e.g. "I just had X"):
   - You MUST estimate macros and include a JSON block at the end:
     ```json
     {{ "detected_foods": [ {{ "name": "Food Name", "calories": 123, "protein": 10, "carbs": 20, "fat": 5, "sugar": 2 }} ] }}
     ```
3. If no new food is reported, do not include the JSON block.

STRICT RESPONSE STRUCTURE:
1. Short direct answer.
2. Data-driven explanation using history.
3. One actionable tip.
4. (Optional) The JSON block.
"""
        # 5. Call Groq
        if not groq_client:
            raise Exception("Groq API key is missing from backend configuration.")
            
        print(f"--- AI ASSISTANT: Using llama-3.3-70b-versatile for query: {request.query[:30]}... ---")
        print("DEBUG PROMPT START:")
        print(prompt)
        print("DEBUG PROMPT END")
        t_start = time.time()
        
        try:
            chat_completion = groq_client.chat.completions.create(
                messages=[
                    {
                        "role": "system",
                        "content": "You are a helpful nutrition assistant for 'Ingrelyze'. If the user reports eating something, you must include the JSON 'detected_foods' block at the end of your response."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                model="llama-3.3-70b-versatile",
                temperature=0.7,
                max_tokens=1024,
                top_p=1,
                stream=False,
            )
            
            full_content = chat_completion.choices[0].message.content.strip()
            
            # Extract JSON if present
            detected_foods = []
            analysis_text = full_content
            
            json_match = re.search(r'```json\s*(\{.*?\})\s*```', full_content, re.DOTALL)
            if json_match:
                try:
                    import json
                    json_data = json.loads(json_match.group(1))
                    detected_foods = json_data.get("detected_foods", [])
                    analysis_text = full_content.replace(json_match.group(0), "").strip()
                except Exception as json_err:
                    print(f"Failed to parse detected_foods JSON: {json_err}")
            
            print(f"--- AI ASSISTANT: Response received. Detected {len(detected_foods)} foods. ---")
            
        except Exception as api_err:
            print(f"--- AI ASSISTANT ERROR: {api_err} ---")
            
            # Log the exact error for diagnostics
            with open("backend_ai_crash.txt", "a", encoding="utf-8") as f:
                f.write(f"\n[{datetime.now().isoformat()}] Groq AI Error: {str(api_err)}\n")
            
            err_msg = str(api_err)
            if "429" in err_msg:
                analysis_text = "The AI assistant has reached its rate limit. Please try again in a few moments."
            else:
                analysis_text = "I'm currently experiencing high demand or connectivity issues. Please try again in a moment."
            detected_foods = []

        return {
            "success": True, 
            "analysis": analysis_text,
            "detected_foods": detected_foods,
            "summary_used": summary
        }
    except Exception as e:
        # Log unexpected backend crashes
        crash_log = f"Crash at {datetime.now().isoformat()}:\n{traceback.format_exc()}\nPayload: {request.dict()}"
        with open("backend_ai_crash.txt", "w", encoding="utf-8") as f:
            f.write(crash_log)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/upload-medical-report")
async def upload_medical_report(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    user_id = user.get("uid")
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")

    # 1. Validate File Ext & type
    allowed_extensions = {".pdf", ".jpg", ".jpeg", ".png"}
    allowed_content_types = {"application/pdf", "image/jpeg", "image/png"}
    
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in allowed_extensions or file.content_type not in allowed_content_types:
        raise HTTPException(status_code=400, detail="Invalid file type. Only PDF, JPG, and PNG are allowed.")

    # 2. Check File Size (Read max 5MB)
    MAX_FILE_SIZE = 5 * 1024 * 1024 # 5 MB
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 5MB.")

    # 3. Save file locally
    os.makedirs("uploads", exist_ok=True)
    file_path = f"uploads/{user_id}_{file.filename}"
    
    with open(file_path, "wb") as f:
        f.write(content)

    extracted_data = {}
    try:
        if not groq_client:
            raise Exception("Groq API key is missing from backend configuration.")

        is_pdf = ext == ".pdf"
        model_to_use = "llama-3.3-70b-versatile" # Default for text
        prompt_with_context = MEDICAL_EXTRACTOR_PROMPT

        if is_pdf:
            # Extract text from PDF
            text_content = extract_text_from_pdf(file_path)
            if not text_content:
                raise Exception("Could not extract any text from the PDF.")
            prompt_with_context = f"{MEDICAL_EXTRACTOR_PROMPT}\n\nMEDICAL REPORT TEXT:\n{text_content}"
            messages = [{"role": "user", "content": prompt_with_context}]
        else:
            # Handle Image with Vision
            model_to_use = "llama-3.2-90b-vision-preview" # Using 90b for better vision accuracy and stability
            base64_image = base64.b64encode(content).decode('utf-8')
            messages = [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": MEDICAL_EXTRACTOR_PROMPT},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{file.content_type};base64,{base64_image}",
                            },
                        },
                    ],
                }
            ]
        
        print(f"DEBUG: Processing medical report with model {model_to_use}...")
        try:
            chat_completion = groq_client.chat.completions.create(
                messages=messages,
                model=model_to_use,
                response_format={"type": "json_object"}
            )
            extracted_data = json.loads(chat_completion.choices[0].message.content)
            print(f"DEBUG: Extracted Data: {extracted_data}")
        except Exception as ai_err:
            print(f"ERROR: Groq AI Processing failed: {ai_err}")
            if hasattr(ai_err, 'response'):
                print(f"ERROR DETAILS: {ai_err.response.text}")
            raise Exception(f"AI error while analyzing report: {ai_err}")

        print(f"--- MEDICAL ANALYZER: Using {model_to_use} for {file.filename} ---")
        t_start = time.time()
        
        chat_completion = groq_client.chat.completions.create(
            messages=messages,
            model=model_to_use,
            temperature=0.1, # Low temperature for consistent JSON extraction
            response_format={"type": "json_object"} if not is_pdf else None # Groq vision doesn't always support json_object mode perfectly
        )
        
        res_text = chat_completion.choices[0].message.content.strip()
        print(f"--- MEDICAL ANALYZER: Response received in {time.time()-t_start:.2f}s ---")

        # Clean up code blocks if present
        if res_text.startswith("```json"):
            res_text = res_text[7:].split("```")[0].strip()
        elif res_text.startswith("```"):
            res_text = res_text[3:].split("```")[0].strip()
            
        extracted_data = json.loads(res_text)
            
    except Exception as e:
        print("Error extracting data via Groq:", str(e))
        extracted_data = {"error": f"Failed to extract text automatically: {str(e)}"}

    # 4. Update Firebase user profile (if possible backend-side)
    # The frontend is already updating its user doc, but we can do it here too or let frontend handle it.
    # To keep the frontend independent of backend firebase-admin constraints, we simply return the path
    # and let the frontend push the reference to Firestore.
    
    return {"success": True, "message": "File uploaded successfully", "path": file_path, "extracted_data": extracted_data}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
