
class RuleEngine:
    def __init__(self):
        pass

    def apply_rules(self, prediction, input_data, user_conditions, food_name=""):
        """
        Applies health rules based on user conditions and nutritional data.
        Returns a modified prediction (if critical) and a list of warnings.
        """
        print(f"[DEBUG Rules] food_name='{food_name}', conditions={user_conditions}")
        warnings = []
        original_prediction = prediction
        
        # Ensure input_data is a dict for easier access
        if not isinstance(input_data, dict):
            # If it's a dataframe row, convert to dict
            try:
                data = input_data.iloc[0].to_dict()
            except:
                data = input_data # Assume it's already dict-like or handle error
        else:
            data = input_data

        # -----------------------------
        # DIABETES RISK (High Sensitivity)
        # -----------------------------
        if "Diabetes:High" in user_conditions:
            if data.get("sugars", 0) > 15:
                warnings.append("High sugar risk (>15g)")
                prediction = max(prediction, 3)

        # -----------------------------
        # HYPERTENSION (High Sensitivity)
        # -----------------------------
        if "Hypertension:High" in user_conditions:
            if data.get("sodium", 0) > 500:
                warnings.append("High sodium risk (>500mg)")
                prediction = max(prediction, 3)

        # -----------------------------
        # CHOLESTEROL (High Sensitivity)
        # -----------------------------
        if "Cholesterol:High" in user_conditions:
            if data.get("cholesterol", 0) > 60:
                warnings.append("High cholesterol risk (>60mg)")
                prediction = max(prediction, 2)
            if data.get("saturated_fats", 0) > 10:
                warnings.append("High saturated fat risk (>10g)")
                prediction = max(prediction, 2)

        # -----------------------------
        # WEIGHT GOAL - LOSE WEIGHT
        # -----------------------------
        if "Goal:LoseWeight" in user_conditions:
            if data.get("caloric_value", 0) > 400:
                warnings.append("High calorie food (>400kcal)")
                prediction = max(prediction, 2)

        # -----------------------------
        # WEIGHT GOAL - GAIN MUSCLE
        # -----------------------------
        if "Goal:GainMuscle" in user_conditions:
            if data.get("protein", 0) > 20:
                warnings.append("High protein content (>20g)")

        # -----------------------------
        # LACTOSE INTOLERANCE (Severe)
        # -----------------------------
        if "Lactose:Severe" in user_conditions:
            # Only warn if the food name suggests dairy or is a common hidden source
            dairy_keywords = [
                'milk', 'cheese', 'yogurt', 'butter', 'cream', 'whey', 'lactose', 
                'pizza', 'ice cream', 'dessert', 'chocolate', 'latte', 'cappuccino',
                'pasta', 'burger', 'sandwich', 'pastry', 'cake', 'cookie'
            ]
            food_lower = (food_name or "").lower()
            if any(kw in food_lower for kw in dairy_keywords):
                warnings.append("May contain dairy, check ingredients")
            elif not food_name: # Fallback if no name provided
                warnings.append("Check ingredients for dairy content")

        # -----------------------------------------------
        # UNIVERSAL THRESHOLDS (Apply regardless of user conditions)
        # These catch objectively unhealthy foods even when
        # the user has no health conditions set.
        # -----------------------------------------------
        sugar_val = data.get("sugars", 0)
        sodium_val = data.get("sodium", 0)
        sat_fat_val = data.get("saturated_fats", 0)
        cal_val = data.get("caloric_value", 0)
        chol_val = data.get("cholesterol", 0)
        fat_val = data.get("fat", 0)

        # Tier 1: Severely unhealthy → Level 3 minimum
        if sugar_val > 40:
            if "Excessive sugar (>40g)" not in warnings:
                warnings.append("Excessive sugar (>40g)")
            prediction = max(prediction, 3)
        if sodium_val > 1200:
            if "Excessive sodium (>1200mg)" not in warnings:
                warnings.append("Excessive sodium (>1200mg)")
            prediction = max(prediction, 3)
        if sat_fat_val > 20:
            if "Excessive saturated fat (>20g)" not in warnings:
                warnings.append("Excessive saturated fat (>20g)")
            prediction = max(prediction, 3)
        if cal_val > 800:
            if "Very high calorie food (>800kcal)" not in warnings:
                warnings.append("Very high calorie food (>800kcal)")
            prediction = max(prediction, 3)

        # Tier 2: Moderately unhealthy → Level 2 minimum
        if sugar_val > 25 and prediction < 3:
            if not any("sugar" in w.lower() for w in warnings):
                warnings.append("High sugar content (>25g)")
            prediction = max(prediction, 2)
        if sodium_val > 800 and prediction < 3:
            if not any("sodium" in w.lower() for w in warnings):
                warnings.append("High sodium content (>800mg)")
            prediction = max(prediction, 2)
        if sat_fat_val > 15 and prediction < 3:
            if not any("saturated fat" in w.lower() for w in warnings):
                warnings.append("High saturated fat (>15g)")
            prediction = max(prediction, 2)
        if fat_val > 30 and prediction < 3:
            if not any("fat" in w.lower() for w in warnings):
                warnings.append("High fat content (>30g)")
            prediction = max(prediction, 2)
        if chol_val > 100 and prediction < 3:
            if not any("cholesterol" in w.lower() for w in warnings):
                warnings.append("High cholesterol (>100mg)")
            prediction = max(prediction, 2)
        if cal_val > 600 and prediction < 3:
            if not any("calorie" in w.lower() for w in warnings):
                warnings.append("High calorie food (>600kcal)")
            prediction = max(prediction, 2)

        return prediction, warnings
