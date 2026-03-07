async function testAnalyze() {
    try {
        const res = await fetch("http://localhost:8000/analyze", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6IjUyM2RlYTQ4M" // mock token format
            },
            body: JSON.stringify({
                "query": "biriyani",
                "local_date": "2026-03-06",
                "user_preferences": {
                    "diabetes_level": "Low",
                    "hypertension_level": "Low",
                    "cholesterol_level": "Low",
                    "lactose_level": "None",
                    "weight_goal": "maintain",
                    "height_cm": 0,
                    "weight_kg": 0
                }
            })
        });

        console.log("Status:", res.status);
        const text = await res.text();
        console.log("Body:", text);
    } catch (err) {
        console.error("Fetch failed:", err);
    }
}
testAnalyze();
