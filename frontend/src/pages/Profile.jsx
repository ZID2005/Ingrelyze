import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import "./Profile.css";
import axios from "axios";
import API from "../utils/api";
import GreetingText from "../components/GreetingText";
import AnimatedText from "../components/AnimatedText";
import LightPillar from "../components/LightPillar";

export default function Profile() {
    const { currentUser } = useAuth();
    const navigate = useNavigate();

    const [preferences, setPreferences] = useState({
        name: "",
        age: "",
        gender: "Prefer not to say",
        weightGoal: "maintain",
        height: "",
        weight: "",
        diabetes: "Low",
        hypertension: "Low",
        cholesterol: "Low",
        lactose: "None"
    });

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [selectedFile, setSelectedFile] = useState(null);
    const [extractedInfo, setExtractedInfo] = useState(null);
    const [showPreviewModal, setShowPreviewModal] = useState(false);
    const [pendingPrefs, setPendingPrefs] = useState(null);

    useEffect(() => {
        async function loadProfile() {
            if (!currentUser) return;
            try {
                const docRef = doc(db, "users", currentUser.uid);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setPreferences(prev => ({ 
                        ...prev, 
                        ...data,
                        name: data.name || currentUser.displayName || "" 
                    }));
                } else if (currentUser.displayName) {
                    setPreferences(prev => ({ ...prev, name: currentUser.displayName }));
                }
            } catch (err) {
                console.error("Failed to load profile:", err);
                setError("Failed to load your profile.");
            } finally {
                setLoading(false);
            }
        }
        loadProfile();
    }, [currentUser]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setPreferences(prev => ({ ...prev, [name]: value }));
    };

    const savePreferences = async (prefsToSave, extractedDataToMerge = null) => {
        try {
            let finalPrefs = { ...prefsToSave };

            if (extractedDataToMerge && !extractedDataToMerge.error) {
                if (extractedDataToMerge.diabetes && extractedDataToMerge.diabetes !== "Unknown") finalPrefs.diabetes = extractedDataToMerge.diabetes;
                if (extractedDataToMerge.hypertension && extractedDataToMerge.hypertension !== "Unknown") finalPrefs.hypertension = extractedDataToMerge.hypertension;
                if (extractedDataToMerge.cholesterol && extractedDataToMerge.cholesterol !== "Unknown") finalPrefs.cholesterol = extractedDataToMerge.cholesterol;
                if (extractedDataToMerge.lactose && extractedDataToMerge.lactose !== "Unknown") finalPrefs.lactose = extractedDataToMerge.lactose;
            }

            await setDoc(doc(db, "users", currentUser.uid), finalPrefs, { merge: true });
            setPreferences(finalPrefs);
            setSelectedFile(null);
            setExtractedInfo(extractedDataToMerge); // Update extractedInfo state
            setSuccess("Profile updated successfully!");
        } catch (err) {
            console.error("Failed to update profile", err);
            setError(err.response?.data?.detail || "Failed to update profile.");
        } finally {
            setLoading(false);
            setShowPreviewModal(false);
            setPendingPrefs(null);
        }
    };

    const handleConfirmAndApply = async () => {
        setLoading(true);
        setError("");
        setSuccess("");
        await savePreferences(pendingPrefs, extractedInfo);
    };

    const handleEditManually = async () => {
        // Apply the medicalReportRef but don't merge extracted data yet.
        // The user can then manually adjust fields based on the extractedInfo
        setLoading(true);
        setError("");
        setSuccess("");
        // Merging to local preferences only so UI updates
        let localPrefs = { ...pendingPrefs };
        if (extractedInfo && !extractedInfo.error) {
            if (extractedInfo.diabetes && extractedInfo.diabetes !== "Unknown") localPrefs.diabetes = extractedInfo.diabetes;
            if (extractedInfo.hypertension && extractedInfo.hypertension !== "Unknown") localPrefs.hypertension = extractedInfo.hypertension;
            if (extractedInfo.cholesterol && extractedInfo.cholesterol !== "Unknown") localPrefs.cholesterol = extractedInfo.cholesterol;
            if (extractedInfo.lactose && extractedInfo.lactose !== "Unknown") localPrefs.lactose = extractedInfo.lactose;
        }
        setPreferences(localPrefs);

        setShowPreviewModal(false);
        setPendingPrefs(null);
        setSelectedFile(null);
        setLoading(false);
        setSuccess("Report parsed! Please review the dropdowns and click 'Save Profile Changes' when done.");
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    };

    const handleSubmit = async (e) => {
        if (e) e.preventDefault();
        setError("");
        setSuccess("");
        setLoading(true);

        try {
            let medicalReportRef = preferences.medicalReportRef || null;
            let currentExtractedInfo = extractedInfo; // Keep track of current extracted info

            // 1. Upload file if selected
            if (selectedFile) {
                const formData = new FormData();
                formData.append("file", selectedFile);

                const token = await currentUser.getIdToken();
                const res = await axios.post(`${API}/upload-medical-report`, formData, {
                    headers: {
                        "Content-Type": "multipart/form-data",
                        "Authorization": `Bearer ${token}`
                    }
                });

                if (res.data && res.data.success) {
                    medicalReportRef = res.data.path;
                    if (res.data.extracted_data && !res.data.extracted_data.error) {
                        currentExtractedInfo = res.data.extracted_data;
                    } else {
                        currentExtractedInfo = null; // Clear if extraction failed or no data
                    }
                } else {
                    currentExtractedInfo = null; // Clear if upload failed
                }
            }

            // Prepare preferences to save (without merging extracted data yet)
            let updatedPrefs = { ...preferences, medicalReportRef };

            if (selectedFile) {
                if (!currentExtractedInfo || currentExtractedInfo.error) {
                    await savePreferences(updatedPrefs, null);
                    setSuccess("");
                    setError("Profile saved, but we could not read medical data from the uploaded file.");
                    return;
                }

                const checkUnk = (v) => !v || String(v).toLowerCase() === "unknown";
                const isAllUnknown = checkUnk(currentExtractedInfo.diabetes) &&
                    checkUnk(currentExtractedInfo.hypertension) &&
                    checkUnk(currentExtractedInfo.cholesterol) &&
                    checkUnk(currentExtractedInfo.lactose);

                if (isAllUnknown) {
                    await savePreferences(updatedPrefs, null);
                    setSuccess("");
                    setError("Profile saved. However, no relevant medical data could be detected in the uploaded document.");
                    return;
                }

                // If a file was uploaded and data was extracted, show modal for review
                setExtractedInfo(currentExtractedInfo);
                setPendingPrefs(updatedPrefs); // Store preferences to save later
                setShowPreviewModal(true);
                setLoading(false); // Stop loading while modal is open
            } else {
                // No file uploaded proceed to save directly
                await savePreferences(updatedPrefs, null);
            }

        } catch (err) {
            console.error("Failed to update profile", err);
            setError(err.response?.data?.detail || "Failed to update profile.");
            setLoading(false);
        }
    };

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: { staggerChildren: 0.1, delayChildren: 0.3 }
        }
    };

    const itemVariants = {
        hidden: { y: 20, opacity: 0 },
        visible: {
            y: 0,
            opacity: 1,
            transition: { type: "spring", stiffness: 300, damping: 24 }
        }
    };

    if (loading) {
        return (
            <div className="flex-center full-height" style={{ background: '#020617', height: '100vh', width: '100vw' }}>
                <div className="spinner"></div>
            </div>
        );
    }

    return (
        <div className="profile-page auth-layout" style={{ minHeight: '100vh', width: '100%', background: '#000' }}>
            {/* Background Animation from Auth pages */}
            <LightPillar
                topColor="#b19eef"
                bottomColor="#020617"
                intensity={0.6}
                quality="medium"
                pillarWidth={1.5}
                pillarHeight={0.6}
                pillarRotation={35}
            />

            <div style={{ position: 'relative', zIndex: 10, width: '100%', height: '100%', padding: '2rem 1rem' }}>
                {/* TOP BAR / HEADER ROW */}
                <div style={{ position: 'absolute', top: '2rem', left: '2rem', right: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 100 }}>
                    <div className="floating-brand" style={{ position: 'static', margin: 0 }}>Ingrelyze</div>

                    <div style={{ position: 'absolute', left: 0, right: 0, top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', pointerEvents: 'none' }}>
                        <span style={{
                            color: '#fff',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            letterSpacing: '0.15em',
                            textTransform: 'uppercase',
                            opacity: 0.6,
                            pointerEvents: 'auto',
                            lineHeight: 1,
                            marginBottom: '0.4rem'
                        }}>Your Health Profile</span>
                        <div style={{ pointerEvents: 'auto' }}>
                            {preferences.name || currentUser?.displayName ? (
                                <GreetingText
                                    key={`profile-name-${preferences.name || currentUser.displayName}`}
                                    text={preferences.name || currentUser.displayName}
                                    delay={40}
                                    duration={1.2}
                                    ease="power2.out"
                                    className="profile-shiny-name"
                                    style={{ overflow: 'visible' }}
                                />
                            ) : (
                                <GreetingText
                                    key={`profile-email-${currentUser?.email}`}
                                    text={currentUser?.email?.split('@')[0] || "User"}
                                    delay={40}
                                    duration={1.2}
                                    ease="power2.out"
                                    className="profile-shiny-name"
                                    style={{ overflow: 'visible' }}
                                />
                            )}
                        </div>
                        <AnimatedText
                            text="Customize your nutrition settings and medical context"
                            textClassName="text-[#94a3b8] font-normal"
                            style={{
                                fontSize: '0.9rem',
                                marginTop: '0.4rem',
                                opacity: 0.9
                            }}
                        />
                    </div>

                    {/* Navigation Buttons */}
                    <div className="floating-nav" style={{ position: 'static', display: 'flex', gap: '1rem', margin: 0 }}>
                        <div className="nav-icon-btn" onClick={() => navigate('/')} title="Dashboard" style={{ cursor: 'pointer', padding: '0.5rem', background: 'rgba(255,255,255,0.1)', borderRadius: '50%', color: '#fff' }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                                <polyline points="9 22 9 12 15 12 15 22"></polyline>
                            </svg>
                        </div>
                    </div>
                </div>

                <motion.div
                    className="profile-content"
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                    style={{ maxWidth: '1200px', margin: '4rem auto 2rem', position: 'relative' }}
                >
                    {/* Invisible Placeholder to maintain exact layout spacing for the cards below */}
                    <div className="profile-header" style={{ marginBottom: '2rem', textAlign: 'center', visibility: 'hidden', pointerEvents: 'none' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                            <span style={{ fontSize: '2rem', fontWeight: 700, lineHeight: 1.2 }}>Your Health Profile</span>
                            <span style={{ fontSize: '1.2rem', fontWeight: 600, lineHeight: 1.2 }}>Username</span>
                        </div>
                        <p style={{ fontSize: '1rem', lineHeight: 1.5 }}>Customize your nutrition settings and medical context</p>
                    </div>

                    {error && <div className="profile-alert-error" style={{ color: '#ef4444', textAlign: 'center', marginBottom: '1rem' }}>{error}</div>}
                    {success && <div className="profile-alert-success" style={{ color: '#10b981', textAlign: 'center', marginBottom: '1rem' }}>{success}</div>}

                    <form onSubmit={handleSubmit} className="profile-form" style={{ display: 'flex', flexDirection: 'column', gap: '2rem', width: '100%', maxWidth: '1200px', margin: '0 auto', paddingBottom: '2rem' }}>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '2rem', width: '100%' }}>
                            {/* LEFT COLUMN */}
                            <motion.div className="profile-column-left" variants={itemVariants} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

                                {/* Account Details Box */}
                                <div className="wizard-card-glass" style={{ margin: 0, width: '100%', maxWidth: '100%', padding: '2.5rem', minHeight: 'auto', display: 'block', background: 'rgba(255, 255, 255, 0.03)', backdropFilter: 'blur(16px)', borderRadius: '24px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                                    <div className="wizard-title" style={{ fontSize: '1.4rem', textAlign: 'left', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem', fontWeight: 600 }}>Account Details</div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                        <div className="glass-input-group" style={{ marginBottom: 0 }}>
                                            <label style={{ display: 'block', color: '#cbd5e1', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Name</label>
                                            <input
                                                type="text"
                                                name="name"
                                                className="glass-input profile-interactive-input"
                                                value={preferences.name}
                                                onChange={handleChange}
                                                placeholder="e.g. Alex"
                                                style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '0.85rem 1rem', color: '#fff', transition: 'all 0.3s ease' }}
                                            />
                                        </div>
                                        
                                        {/* Demographics Grid */}
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                            <div className="glass-input-group" style={{ marginBottom: 0 }}>
                                                <label style={{ display: 'block', color: '#cbd5e1', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Age</label>
                                                <input
                                                    type="number"
                                                    name="age"
                                                    className="glass-input profile-interactive-input"
                                                    value={preferences.age}
                                                    onChange={handleChange}
                                                    placeholder="e.g. 30"
                                                    min="0"
                                                    max="120"
                                                    style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '0.85rem 1rem', color: '#fff', transition: 'all 0.3s ease' }}
                                                />
                                            </div>
                                            <div className="glass-input-group" style={{ marginBottom: 0 }}>
                                                <label style={{ display: 'block', color: '#cbd5e1', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Gender</label>
                                                <select
                                                    name="gender"
                                                    className="glass-input profile-interactive-input"
                                                    value={preferences.gender}
                                                    onChange={handleChange}
                                                    style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '0.85rem 1rem', color: '#fff', transition: 'all 0.3s ease', appearance: 'none' }}
                                                >
                                                    <option value="Prefer not to say" style={{ color: '#000' }}>Prefer not to say</option>
                                                    <option value="Male" style={{ color: '#000' }}>Male</option>
                                                    <option value="Female" style={{ color: '#000' }}>Female</option>
                                                    <option value="Non-binary" style={{ color: '#000' }}>Non-binary</option>
                                                    <option value="Other" style={{ color: '#000' }}>Other</option>
                                                </select>
                                            </div>
                                        </div>

                                        <div className="glass-input-group" style={{ marginBottom: 0 }}>
                                            <label style={{ display: 'block', color: '#cbd5e1', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Email Address</label>
                                            <input
                                                type="email"
                                                className="glass-input"
                                                value={currentUser?.email || ""}
                                                disabled
                                                style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '0.85rem 1rem', color: '#fff', opacity: 0.5, cursor: 'not-allowed' }}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Body Metrics Box */}
                                <div className="wizard-card-glass" style={{ margin: 0, width: '100%', maxWidth: '100%', padding: '2.5rem', minHeight: 'auto', display: 'block', background: 'rgba(255, 255, 255, 0.03)', backdropFilter: 'blur(16px)', borderRadius: '24px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                                    <div className="wizard-title" style={{ fontSize: '1.4rem', textAlign: 'left', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem', fontWeight: 600 }}>Body Metrics</div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
                                        <div className="glass-input-group" style={{ marginBottom: 0 }}>
                                            <label style={{ display: 'block', color: '#cbd5e1', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Height (cm)</label>
                                            <input
                                                type="number"
                                                className="glass-input profile-interactive-input"
                                                name="height"
                                                value={preferences.height}
                                                onChange={handleChange}
                                                placeholder="e.g. 175"
                                                required
                                                style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '0.85rem 1rem', color: '#fff', transition: 'all 0.3s ease' }}
                                            />
                                        </div>
                                        <div className="glass-input-group" style={{ marginBottom: 0 }}>
                                            <label style={{ display: 'block', color: '#cbd5e1', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Weight (kg)</label>
                                            <input
                                                type="number"
                                                className="glass-input profile-interactive-input"
                                                name="weight"
                                                value={preferences.weight}
                                                onChange={handleChange}
                                                placeholder="e.g. 70"
                                                required
                                                style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '0.85rem 1rem', color: '#fff', transition: 'all 0.3s ease' }}
                                            />
                                        </div>
                                    </div>

                                    <div className="glass-input-group" style={{ marginBottom: 0 }}>
                                        <label style={{ display: 'block', color: '#cbd5e1', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Weight Goal</label>
                                        <div className="glass-options-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '1rem', width: '100%' }}>
                                            {['Lose Weight', 'Maintain', 'Gain Muscle'].map((label, idx) => {
                                                const val = ['lose', 'maintain', 'gain_muscle'][idx];
                                                const icon = ['📉', '⚖️', '💪'][idx];
                                                return (
                                                    <div
                                                        key={val}
                                                        className={`glass-option-card ${preferences.weightGoal === val ? 'selected' : ''}`}
                                                        onClick={() => handleChange({ target: { name: 'weightGoal', value: val } })}
                                                        style={{ background: preferences.weightGoal === val ? 'rgba(177, 158, 239, 0.2)' : 'rgba(255, 255, 255, 0.05)', border: `1px solid ${preferences.weightGoal === val ? '#b19eef' : 'rgba(255, 255, 255, 0.1)'}`, borderRadius: '16px', padding: '1.25rem 0.5rem', cursor: 'pointer', transition: 'all 0.3s', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: '0.5rem', boxShadow: preferences.weightGoal === val ? '0 0 20px rgba(177, 158, 239, 0.3)' : 'none' }}
                                                    >
                                                        <div className="glass-option-icon" style={{ fontSize: '1.8rem' }}>{icon}</div>
                                                        <div className="glass-option-label" style={{ fontWeight: 600, fontSize: '0.85rem', color: '#f1f5f9' }}>{label}</div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </motion.div>

                            {/* RIGHT COLUMN */}
                            <motion.div className="profile-column-right" variants={itemVariants} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                <div className="wizard-card-glass" style={{ margin: 0, width: '100%', maxWidth: '100%', padding: '2.5rem', flex: 1, display: 'flex', flexDirection: 'column', background: 'rgba(255, 255, 255, 0.03)', backdropFilter: 'blur(16px)', borderRadius: '24px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                                    <div className="wizard-title" style={{ fontSize: '1.4rem', textAlign: 'left', marginBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem', fontWeight: 600 }}>Health Conditions & Risks</div>
                                    <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '2rem' }}>Specify your medical context for accurate food analysis.</p>

                                    <div className="glass-input-group" style={{ marginBottom: '1.5rem' }}>
                                        <label style={{ display: 'block', color: '#cbd5e1', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Diabetes Risk</label>
                                        <div className="glass-options-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', width: '100%' }}>
                                            {['Low', 'Medium', 'High'].map(val => (
                                                <div
                                                    key={val}
                                                    className={`glass-option-card ${preferences.diabetes === val ? 'selected' : ''}`}
                                                    onClick={() => handleChange({ target: { name: 'diabetes', value: val } })}
                                                    style={{ background: preferences.diabetes === val ? 'rgba(177, 158, 239, 0.2)' : 'rgba(255, 255, 255, 0.05)', border: `1px solid ${preferences.diabetes === val ? '#b19eef' : 'rgba(255, 255, 255, 0.1)'}`, borderRadius: '12px', padding: '0.75rem', cursor: 'pointer', textAlign: 'center', transition: 'all 0.3s' }}
                                                >
                                                    <div className="glass-option-label" style={{ fontWeight: 600, fontSize: '0.9rem', color: '#f1f5f9' }}>{val}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="glass-input-group" style={{ marginBottom: '1.5rem' }}>
                                        <label style={{ display: 'block', color: '#cbd5e1', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Hypertension (Blood Pressure)</label>
                                        <div className="glass-options-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', width: '100%' }}>
                                            {['Low', 'Medium', 'High'].map(val => (
                                                <div
                                                    key={val}
                                                    className={`glass-option-card ${preferences.hypertension === val ? 'selected' : ''}`}
                                                    onClick={() => handleChange({ target: { name: 'hypertension', value: val } })}
                                                    style={{ background: preferences.hypertension === val ? 'rgba(177, 158, 239, 0.2)' : 'rgba(255, 255, 255, 0.05)', border: `1px solid ${preferences.hypertension === val ? '#b19eef' : 'rgba(255, 255, 255, 0.1)'}`, borderRadius: '12px', padding: '0.75rem', cursor: 'pointer', textAlign: 'center', transition: 'all 0.3s' }}
                                                >
                                                    <div className="glass-option-label" style={{ fontWeight: 600, fontSize: '0.9rem', color: '#f1f5f9' }}>{val}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="glass-input-group" style={{ marginBottom: '1.5rem' }}>
                                        <label style={{ display: 'block', color: '#cbd5e1', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Cholesterol Sensitivity</label>
                                        <div className="glass-options-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', width: '100%' }}>
                                            {['Low', 'Medium', 'High'].map(val => (
                                                <div
                                                    key={val}
                                                    className={`glass-option-card ${preferences.cholesterol === val ? 'selected' : ''}`}
                                                    onClick={() => handleChange({ target: { name: 'cholesterol', value: val } })}
                                                    style={{ background: preferences.cholesterol === val ? 'rgba(177, 158, 239, 0.2)' : 'rgba(255, 255, 255, 0.05)', border: `1px solid ${preferences.cholesterol === val ? '#b19eef' : 'rgba(255, 255, 255, 0.1)'}`, borderRadius: '12px', padding: '0.75rem', cursor: 'pointer', textAlign: 'center', transition: 'all 0.3s' }}
                                                >
                                                    <div className="glass-option-label" style={{ fontWeight: 600, fontSize: '0.9rem', color: '#f1f5f9' }}>{val}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="glass-input-group" style={{ marginBottom: '1.5rem' }}>
                                        <label style={{ display: 'block', color: '#cbd5e1', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>Lactose Intolerance</label>
                                        <div className="glass-options-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', width: '100%' }}>
                                            {['None', 'Mild', 'Severe'].map(val => (
                                                <div
                                                    key={val}
                                                    className={`glass-option-card ${preferences.lactose === val ? 'selected' : ''}`}
                                                    onClick={() => handleChange({ target: { name: 'lactose', value: val } })}
                                                    style={{ background: preferences.lactose === val ? 'rgba(177, 158, 239, 0.2)' : 'rgba(255, 255, 255, 0.05)', border: `1px solid ${preferences.lactose === val ? '#b19eef' : 'rgba(255, 255, 255, 0.1)'}`, borderRadius: '12px', padding: '0.75rem', cursor: 'pointer', textAlign: 'center', transition: 'all 0.3s' }}
                                                >
                                                    <div className="glass-option-label" style={{ fontWeight: 600, fontSize: '0.9rem', color: '#f1f5f9' }}>{val}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* NEW MEDICAL REPORT CARD */}
                                <div className="wizard-card-glass" style={{ margin: 0, width: '100%', maxWidth: '100%', padding: '2.5rem', display: 'flex', flexDirection: 'column', background: 'rgba(255, 255, 255, 0.03)', backdropFilter: 'blur(16px)', borderRadius: '24px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                                    <div className="wizard-title" style={{ fontSize: '1.4rem', textAlign: 'left', marginBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem', fontWeight: 600 }}>Medical Health Report</div>
                                    <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '1.5rem' }}>Upload a medical report to automatically detect your health conditions. (Optional)</p>

                                    <div className="glass-input-group" style={{ marginBottom: 0 }}>
                                        <input
                                            type="file"
                                            id="medical-report-upload"
                                            accept=".pdf, .jpg, .jpeg, .png"
                                            style={{ display: 'none' }}
                                            onChange={(e) => {
                                                if (e.target.files && e.target.files.length > 0) {
                                                    setSelectedFile(e.target.files[0]);
                                                }
                                            }}
                                        />
                                        <label htmlFor="medical-report-upload" className="glass-option-card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(255, 255, 255, 0.05)', border: '1px dashed rgba(255, 255, 255, 0.2)', borderRadius: '16px', padding: '2rem', cursor: 'pointer', transition: 'all 0.3s', textAlign: 'center' }}
                                            onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(177, 158, 239, 0.1)'; e.currentTarget.style.borderColor = '#b19eef' }}
                                            onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'; e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)' }}
                                        >
                                            {selectedFile ? (
                                                <>
                                                    <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>✅</div>
                                                    <div style={{ fontWeight: 600, fontSize: '1rem', color: '#f1f5f9' }}>{selectedFile.name}</div>
                                                    <div style={{ fontSize: '0.85rem', color: '#10b981', marginTop: '0.5rem' }}>Ready to analyze</div>
                                                </>
                                            ) : (
                                                <>
                                                    <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📄</div>
                                                    <div style={{ fontWeight: 600, fontSize: '1rem', color: '#f1f5f9' }}>Upload Medical Report</div>
                                                    <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '0.5rem' }}>PDF, JPG, PNG</div>
                                                </>
                                            )}
                                        </label>
                                    </div>

                                    {/* Removed old extracted text box from here since it moves to the modal */}
                                </div>

                            </motion.div>
                        </div> {/* End of grid wrapper */}

                        {/* Centered Save Button Card placed OUTSIDE the 2-column grid */}
                        <div style={{ display: 'flex', justifyContent: 'center', width: '100%', marginTop: '-1rem' }}>
                            <div className="wizard-card-glass" style={{ margin: 0, width: 'fit-content', minWidth: '320px', minHeight: 'auto', padding: '1rem', display: 'flex', justifyContent: 'center', background: 'rgba(255, 255, 255, 0.03)', backdropFilter: 'blur(16px)', borderRadius: '24px', border: '1px solid rgba(255, 255, 255, 0.08)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 30px rgba(177, 158, 239, 0.15)' }}>
                                <button type="submit" disabled={loading} className="btn-wizard-next" style={{ width: '100%', maxWidth: '300px', background: 'linear-gradient(135deg, #b19eef 0%, #7e5ae0 100%)', color: '#fff', border: 'none', padding: '0.8rem 1.5rem', borderRadius: '30px', fontWeight: 700, fontSize: '1.1rem', cursor: 'pointer', boxShadow: '0 4px 15px rgba(177, 158, 239, 0.4)', transition: 'all 0.3s' }}>
                                    {loading ? 'Saving Changes...' : 'Save Profile Changes'}
                                </button>
                            </div>
                        </div>

                    </form>
                </motion.div>
            </div>

            {/* CONFIRMATION PREVIEW MODAL */}
            {showPreviewModal && extractedInfo && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
                    background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(8px)',
                    zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        style={{
                            background: 'rgba(15, 23, 42, 0.8)',
                            border: '1px solid rgba(177, 158, 239, 0.3)',
                            borderRadius: '24px',
                            padding: '2.5rem',
                            maxWidth: '500px',
                            width: '90%',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 40px rgba(177, 158, 239, 0.2)'
                        }}
                    >
                        <h2 style={{ color: '#f1f5f9', fontSize: '1.5rem', marginBottom: '1rem', fontWeight: 700 }}>Detected Health Information</h2>
                        <p style={{ color: '#cbd5e1', fontSize: '0.95rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                            We analyzed your medical report and found the following indicators. Would you like to automatically apply these settings?
                        </p>

                        <div style={{ background: 'rgba(0, 0, 0, 0.3)', borderRadius: '16px', padding: '1.5rem', marginBottom: '2rem', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <div style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 500, marginBottom: '0.2rem' }}>Diabetes Risk</div>
                                    <div style={{ color: extractedInfo.diabetes !== 'Unknown' ? '#b19eef' : '#64748b', fontWeight: 600 }}>{extractedInfo.diabetes}</div>
                                </div>
                                <div>
                                    <div style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 500, marginBottom: '0.2rem' }}>Blood Pressure Risk</div>
                                    <div style={{ color: extractedInfo.hypertension !== 'Unknown' ? '#b19eef' : '#64748b', fontWeight: 600 }}>{extractedInfo.hypertension}</div>
                                </div>
                                <div>
                                    <div style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 500, marginBottom: '0.2rem' }}>Cholesterol Sensitivity</div>
                                    <div style={{ color: extractedInfo.cholesterol !== 'Unknown' ? '#b19eef' : '#64748b', fontWeight: 600 }}>{extractedInfo.cholesterol}</div>
                                </div>
                                <div>
                                    <div style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 500, marginBottom: '0.2rem' }}>Lactose Intolerance</div>
                                    <div style={{ color: extractedInfo.lactose !== 'Unknown' ? '#b19eef' : '#64748b', fontWeight: 600 }}>{extractedInfo.lactose}</div>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                            <button
                                onClick={handleEditManually}
                                disabled={loading}
                                style={{
                                    background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)',
                                    color: '#cbd5e1', padding: '0.75rem 1.5rem', borderRadius: '12px', fontWeight: 600,
                                    cursor: 'pointer', transition: 'all 0.2s'
                                }}
                                onMouseOver={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)' }}
                                onMouseOut={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)' }}
                            >
                                Edit Manually
                            </button>
                            <button
                                onClick={handleConfirmAndApply}
                                disabled={loading}
                                style={{
                                    background: 'linear-gradient(135deg, #b19eef 0%, #7e5ae0 100%)', border: 'none',
                                    color: '#fff', padding: '0.75rem 1.5rem', borderRadius: '12px', fontWeight: 600,
                                    cursor: 'pointer', boxShadow: '0 4px 15px rgba(177, 158, 239, 0.4)', transition: 'all 0.2s'
                                }}
                            >
                                Confirm and Apply
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
}
