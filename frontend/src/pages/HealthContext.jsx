import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import "./HealthWizard.css";

const steps = [
    { id: 1, title: "Your Goal", subtitle: "What is your primary objective?" },
    { id: 2, title: "Basic Info", subtitle: "Help us calculate your needs." },
    { id: 3, title: "Measurements", subtitle: "Your current body metrics." },
    { id: 4, title: "Activity Level", subtitle: "How active are you daily?" },
    { id: 5, title: "Dietary Preferences", subtitle: "Any specific diet you follow?" },
    { id: 6, title: "Intolerances", subtitle: "Any foods you avoid?" },
    { id: 7, title: "Health Risks (1/2)", subtitle: "Do you have any of these conditions?" },
    { id: 8, title: "Health Risks (2/2)", subtitle: "A few more details for accuracy." }
];

const variants = {
    enter: (direction) => ({
        x: direction > 0 ? 50 : -50,
        opacity: 0
    }),
    center: {
        zIndex: 1,
        x: 0,
        opacity: 1
    },
    exit: (direction) => ({
        zIndex: 0,
        x: direction < 0 ? 50 : -50,
        opacity: 0
    })
};

export default function HealthContext() {
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [currentStep, setCurrentStep] = useState(0); // 0-indexed for array access
    const [direction, setDirection] = useState(0);

    const [formData, setFormData] = useState({
        weightGoal: "",
        gender: "",
        age: "",
        height: "",
        weight: "",
        activityLevel: "",
        dietType: "",
        lactose: "None",
        gluten: "None",
        diabetes: "Low",
        hypertension: "Low",
        cholesterol: "Low"
    });

    useEffect(() => {
        async function loadData() {
            if (!currentUser) return;
            try {
                const docRef = doc(db, "users", currentUser.uid);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    setFormData(prev => ({ ...prev, ...docSnap.data() }));
                }
            } catch (err) {
                console.error("Error loading data:", err);
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, [currentUser]);

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const nextStep = () => {
        if (currentStep < steps.length - 1) {
            setDirection(1);
            setCurrentStep(prev => prev + 1);
        } else {
            handleFinish();
        }
    };

    const prevStep = () => {
        if (currentStep > 0) {
            setDirection(-1);
            setCurrentStep(prev => prev - 1);
        }
    };

    async function handleFinish() {
        setSaving(true);
        try {
            await setDoc(doc(db, "users", currentUser.uid), formData, { merge: true });
            navigate("/"); // Go to dashboard
        } catch (err) {
            console.error("Error saving:", err);
            alert("Failed to save profile.");
        } finally {
            setSaving(false);
        }
    }

    // Validation Logic
    const isStepValid = () => {
        switch (currentStep) {
            case 0: return formData.weightGoal !== "";
            case 1: return formData.gender !== "" && formData.age !== "";
            case 2: return formData.height !== "" && formData.weight !== "";
            case 3: return formData.activityLevel !== "";
            case 4: return true; // Optional (Diet)
            case 5: return true; // Optional (Intolerances default to None)
            case 6: return formData.diabetes !== "";
            case 7: return formData.hypertension !== "" && formData.cholesterol !== "";
            default: return false;
        }
    };

    if (loading) return <div className="flex-center full-height"><div className="spinner"></div></div>;

    const progressPercentage = ((currentStep + 1) / steps.length) * 100;

    return (
        <div style={{ width: '100%', maxWidth: '600px', padding: '1rem', position: 'relative', zIndex: 10 }}>
            <div className="wizard-card-glass">
                {/* Header */}
                <div className="wizard-progress-container">
                    <div className="wizard-step-indicator">
                        <span>Step {currentStep + 1} of {steps.length}</span>
                        <span>{Math.round(progressPercentage)}%</span>
                    </div>
                    <div className="wizard-progress-track">
                        <div className="wizard-progress-fill" style={{ width: `${progressPercentage}%` }}></div>
                    </div>
                </div>

                <div className="wizard-title">{steps[currentStep].title}</div>
                <div className="wizard-subtitle">{steps[currentStep].subtitle}</div>

                {/* Content Area with Animation */}
                <div style={{ flex: 1, position: 'relative', overflowX: 'hidden', minHeight: '280px' }}>
                    <AnimatePresence initial={false} custom={direction} mode="wait">
                        <motion.div
                            key={currentStep}
                            custom={direction}
                            variants={variants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            transition={{
                                x: { type: "spring", stiffness: 300, damping: 30 },
                                opacity: { duration: 0.2 }
                            }}
                            style={{ position: 'absolute', width: '100%', height: '100%' }}
                        >
                            {/* Step 1: Goal */}
                            {currentStep === 0 && (
                                <div className="glass-options-grid">
                                    {[
                                        { val: 'lose', icon: '📉', label: 'Lose Weight' },
                                        { val: 'maintain', icon: '⚖️', label: 'Maintain' },
                                        { val: 'gain_muscle', icon: '💪', label: 'Gain Muscle' }
                                    ].map(opt => (
                                        <div
                                            key={opt.val}
                                            className={`glass-option-card ${formData.weightGoal === opt.val ? 'selected' : ''}`}
                                            onClick={() => handleChange('weightGoal', opt.val)}
                                        >
                                            <div className="glass-option-icon">{opt.icon}</div>
                                            <div className="glass-option-label">{opt.label}</div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Step 2: Basic Info */}
                            {currentStep === 1 && (
                                <>
                                    <div className="glass-input-group">
                                        <label>Gender</label>
                                        <div className="glass-options-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                                            {['Male', 'Female'].map(g => (
                                                <div
                                                    key={g}
                                                    className={`glass-option-card ${formData.gender === g ? 'selected' : ''}`}
                                                    onClick={() => handleChange('gender', g)}
                                                    style={{ padding: '1rem' }}
                                                >
                                                    <div className="glass-option-label">{g}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="glass-input-group">
                                        <label>Age</label>
                                        <input
                                            type="number"
                                            className="glass-input"
                                            value={formData.age}
                                            onChange={(e) => handleChange('age', e.target.value)}
                                            placeholder="e.g. 28"
                                        />
                                    </div>
                                </>
                            )}

                            {/* Step 3: Measurements */}
                            {currentStep === 2 && (
                                <>
                                    <div className="glass-input-group">
                                        <label>Height (cm)</label>
                                        <input
                                            type="number"
                                            className="glass-input"
                                            value={formData.height}
                                            onChange={(e) => handleChange('height', e.target.value)}
                                            placeholder="e.g. 175"
                                        />
                                    </div>
                                    <div className="glass-input-group">
                                        <label>Weight (kg)</label>
                                        <input
                                            type="number"
                                            className="glass-input"
                                            value={formData.weight}
                                            onChange={(e) => handleChange('weight', e.target.value)}
                                            placeholder="e.g. 70"
                                        />
                                    </div>
                                </>
                            )}

                            {/* Step 4: Activity Level */}
                            {currentStep === 3 && (
                                <div className="glass-options-grid" style={{ gridTemplateColumns: '1fr' }}>
                                    {[
                                        { val: 'Sedentary', label: 'Sedentary (Office job)' },
                                        { val: 'Light', label: 'Lightly Active (1-3 days/week)' },
                                        { val: 'Moderate', label: 'Moderately Active (3-5 days/week)' },
                                        { val: 'Active', label: 'Very Active (6-7 days/week)' }
                                    ].map(opt => (
                                        <div
                                            key={opt.val}
                                            className={`glass-option-card ${formData.activityLevel === opt.val ? 'selected' : ''}`}
                                            onClick={() => handleChange('activityLevel', opt.val)}
                                            style={{ flexDirection: 'row', justifyContent: 'flex-start', padding: '1rem' }}
                                        >
                                            <div className="glass-option-label" style={{ marginLeft: '1rem' }}>{opt.label}</div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Step 5: Diet Type */}
                            {currentStep === 4 && (
                                <div className="glass-options-grid">
                                    {['Veg', 'Non Veg'].map(d => (
                                        <div
                                            key={d}
                                            className={`glass-option-card ${formData.dietType === d ? 'selected' : ''}`}
                                            onClick={() => handleChange('dietType', d)}
                                        >
                                            <div className="glass-option-label">{d}</div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Step 6: Intolerances */}
                            {currentStep === 5 && (
                                <>
                                    <div className="glass-input-group">
                                        <label>Lactose Intolerance</label>
                                        <div className="glass-options-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                                            {['None', 'Mild', 'Severe'].map(opt => (
                                                <div
                                                    key={opt}
                                                    className={`glass-option-card ${formData.lactose === opt ? 'selected' : ''}`}
                                                    onClick={() => handleChange('lactose', opt)}
                                                    style={{ padding: '0.75rem' }}
                                                >
                                                    <div className="glass-option-label">{opt}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="glass-input-group">
                                        <label>Gluten Sensitivity</label>
                                        <div className="glass-options-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                                            {['None', 'Mild', 'Severe'].map(opt => (
                                                <div
                                                    key={opt}
                                                    className={`glass-option-card ${formData.gluten === opt ? 'selected' : ''}`}
                                                    onClick={() => handleChange('gluten', opt)}
                                                    style={{ padding: '0.75rem' }}
                                                >
                                                    <div className="glass-option-label">{opt}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* Step 7: Diabetes */}
                            {currentStep === 6 && (
                                <div className="glass-input-group">
                                    <label>Diabetes Risk</label>
                                    <div className="glass-options-grid" style={{ gridTemplateColumns: '1fr' }}>
                                        {['Low', 'Medium', 'High'].map(opt => (
                                            <div
                                                key={opt}
                                                className={`glass-option-card ${formData.diabetes === opt ? 'selected' : ''}`}
                                                onClick={() => handleChange('diabetes', opt)}
                                                style={{ padding: '1rem' }}
                                            >
                                                <div className="glass-option-label">{opt} Risk</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Step 8: Hypertension & Cholesterol */}
                            {currentStep === 7 && (
                                <>
                                    <div className="glass-input-group">
                                        <label>Hypertension</label>
                                        <div className="glass-options-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                                            {['Low', 'Medium', 'High'].map(opt => (
                                                <div
                                                    key={opt}
                                                    className={`glass-option-card ${formData.hypertension === opt ? 'selected' : ''}`}
                                                    onClick={() => handleChange('hypertension', opt)}
                                                    style={{ padding: '0.75rem' }}
                                                >
                                                    <div className="glass-option-label">{opt}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="glass-input-group">
                                        <label>Cholesterol</label>
                                        <div className="glass-options-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                                            {['Low', 'Medium', 'High'].map(opt => (
                                                <div
                                                    key={opt}
                                                    className={`glass-option-card ${formData.cholesterol === opt ? 'selected' : ''}`}
                                                    onClick={() => handleChange('cholesterol', opt)}
                                                    style={{ padding: '0.75rem' }}
                                                >
                                                    <div className="glass-option-label">{opt}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            )}
                        </motion.div>
                    </AnimatePresence>
                </div>

                {/* Footer Actions */}
                <div className="wizard-actions">
                    <button
                        className="btn-wizard-back"
                        onClick={prevStep}
                        style={{ visibility: currentStep === 0 ? 'hidden' : 'visible' }}
                    >
                        Back
                    </button>
                    <button
                        className="btn-wizard-next"
                        onClick={nextStep}
                        disabled={!isStepValid() || saving}
                    >
                        {saving ? "Saving..." : (currentStep === steps.length - 1 ? "Finish" : "Next")}
                    </button>
                </div>
            </div>
        </div>
    );
}
