import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../firebase";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { LineChart, Line, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import Particles from "../components/Particles";
import { GlassCalendar } from "../components/GlassCalendar";

export default function WeeklyReport() {
    const { currentUser } = useAuth();

    // Calculate Week Range (Monday - Sunday)
    const weekRangeString = useMemo(() => {
        const now = new Date();
        const dayOfWeek = now.getDay(); // 0 (Sun) to 6 (Sat)

        // Adjust for Monday start (Monday=1, ..., Sunday=7)
        const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

        const monday = new Date(now);
        monday.setDate(now.getDate() + diffToMonday);

        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);

        const formatOptions = { month: 'short', day: '2-digit' };
        const startStr = monday.toLocaleDateString('en-US', formatOptions);
        const endStr = sunday.toLocaleDateString('en-US', formatOptions);

        return `${startStr} – ${endStr}`;
    }, []);

    const [userPrefs, setUserPrefs] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showCalendar, setShowCalendar] = useState(false);

    // Weekly Data State
    const [weeklyData, setWeeklyData] = useState([]);
    const [weeklyEntries, setWeeklyEntries] = useState([]);
    const [healthImpactLists, setHealthImpactLists] = useState({ positive: [], negative: [], neutral: [] });
    const [weightImpact, setWeightImpact] = useState({ indicator: 'Balanced', label: 'Maintaining Weight', surplusDeficit: 0 });
    const [recommendations, setRecommendations] = useState([]);
    const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
    const [heatmapData, setHeatmapData] = useState([]);
    const [heatmapDailyStats, setHeatmapDailyStats] = useState({});
    const [selectedDayData, setSelectedDayData] = useState(null);
    const [showDayDetail, setShowDayDetail] = useState(false);

    // Memoize nutrition data for GlassCalendar
    const calendarNutritionData = useMemo(() => {
        const data = {};
        Object.keys(heatmapDailyStats).forEach(date => {
            const stats = heatmapDailyStats[date];
            let goal = 2000;
            if (userPrefs?.weightGoal === 'lose') goal = Number(userPrefs.calories) || 1700;
            else if (userPrefs?.weightGoal === 'gain') goal = Number(userPrefs.calories) || 2500;
            else if (userPrefs?.calories) goal = Number(userPrefs.calories);

            const val = stats.calories;
            const diffPercent = ((val - goal) / goal) * 100;

            let status = 1; // Default: Attention/Poor
            let label = "Under Goal";

            if (val === 0) {
                status = 0; // Empty
                label = "No Data";
            } else if (Math.abs(diffPercent) <= 15) {
                status = 3; // Healthy
                label = "Healthy";
            } else if (Math.abs(diffPercent) <= 35) {
                status = 2; // Moderate
                label = "Moderate";
            } else if (diffPercent > 35) {
                status = 1; // Poor
                label = "Poor (Over Limit)";
            } else {
                status = 1; // Deficit
                label = "Under Goal";
            }

            data[date] = { ...stats, status, statusLabel: label, targetGoal: goal };
        });
        return data;
    }, [heatmapDailyStats, userPrefs]);

    // Fetch User Profile
    useEffect(() => {
        async function fetchUserProfile() {
            if (currentUser) {
                try {
                    const docSnap = await getDoc(doc(db, "users", currentUser.uid));
                    if (docSnap.exists()) {
                        setUserPrefs(docSnap.data());
                    }
                } catch (error) {
                    console.error("Error fetching rules:", error);
                }
            }
        }
        fetchUserProfile();
    }, [currentUser]);

    // Fetch Weekly Nutrition Data
    useEffect(() => {
        async function fetchWeeklyTotals() {
            if (!currentUser) return;
            try {
                // Determine Date Ranges
                const heatDates = [];
                for (let i = 29; i >= 0; i--) {
                    const d = new Date();
                    d.setDate(d.getDate() - i);
                    heatDates.push(d.toLocaleDateString('en-CA'));
                }
                const weekDates = heatDates.slice(-7); // Last 7 days

                const q = query(
                    collection(db, "foodEntries"),
                    where("userId", "==", currentUser.uid)
                );
                const snapshot = await getDocs(q);

                const dailyMap = {};
                const rawWeeklyEntries = [];
                heatDates.forEach(d => dailyMap[d] = { calories: 0, protein: 0, carbs: 0, fat: 0, sugar: 0, sodium: 0 });

                snapshot.forEach(doc => {
                    const data = doc.data();
                    if (dailyMap[data.date]) {
                        dailyMap[data.date].calories += Number(data.calories || 0);
                        dailyMap[data.date].protein += Number(data.protein || 0);
                        dailyMap[data.date].carbs += Number(data.carbs || 0);
                        dailyMap[data.date].fat += Number(data.fat || 0);
                        dailyMap[data.date].sugar += Number(data.sugar || 0);
                        dailyMap[data.date].sodium += Number(data.sodium || 0);

                        // Keep track of entries for the weekly summary
                        if (weekDates.includes(data.date)) {
                            rawWeeklyEntries.push(data);
                        }
                    }
                });

                const formattedWeeklyData = weekDates.map(d => {
                    const dateObj = new Date(d);
                    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
                    return {
                        name: dayName,
                        calories: Math.round(dailyMap[d].calories),
                        protein: Math.round(dailyMap[d].protein),
                        carbs: Math.round(dailyMap[d].carbs),
                        fat: Math.round(dailyMap[d].fat),
                        sugar: Math.round(dailyMap[d].sugar),
                        sodium: Math.round(dailyMap[d].sodium)
                    };
                });

                const heatmapValues = heatDates.map(date => ({
                    date,
                    count: Math.round(dailyMap[date].calories)
                }));

                rawWeeklyEntries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                setWeeklyData(formattedWeeklyData);
                setWeeklyEntries(rawWeeklyEntries);
                setHeatmapData(heatmapValues);
                setHeatmapDailyStats(dailyMap);

            } catch (err) {
                console.error("Failed to fetch weekly totals", err);
            } finally {
                setLoading(false);
            }
        }
        fetchWeeklyTotals();
        const intervalId = setInterval(fetchWeeklyTotals, 300000); // refresh 5 mins
        return () => clearInterval(intervalId);
    }, [currentUser]);

    // Derived Analytics Logic (Moved from Dashboard)
    useEffect(() => {
        if (!weeklyEntries.length) return;

        const pos = new Set();
        const neg = new Set();
        const neu = new Set();

        weeklyEntries.forEach(entry => {
            if (!entry || !entry.foodName) return;
            const name = entry.foodName;

            // Use the backend-provided healthLevel if available (already accounts for user risk)
            if (entry.healthLevel !== undefined && entry.healthLevel !== null) {
                const level = Number(entry.healthLevel);
                if (level <= 1) pos.add(name);
                else if (level >= 3) neg.add(name);
                else neu.add(name);
            } else {
                // Heuristic Fallback for historical data (missing healthLevel)
                const sugarRaw = entry.sugar || entry.fullNutrients?.sugar;
                const sodiumRaw = entry.sodium || entry.fullNutrients?.sodium;
                const fatRaw = entry.fat || entry.fullNutrients?.fat;

                const sugar = Number(sugarRaw || 0);
                const sodium = Number(sodiumRaw || 0);
                const fat = Number(fatRaw || 0);

                const hasDiabetes = userPrefs?.diabetes === "High" || userPrefs?.diabetes === "Medium" || userPrefs?.diabetesRisk === 'yes';
                const hasHypertension = userPrefs?.hypertension === "High" || userPrefs?.hypertension === "Medium" || userPrefs?.hypertension === 'yes';
                const hasCholesterol = userPrefs?.cholesterol === "High" || userPrefs?.cholesterol === "Medium" || userPrefs?.cholesterolSensitivity === 'yes';

                let isNeg = false;
                let isPos = false;

                // Risk-based checks (Historical logic)
                if (hasDiabetes && sugar > 10) isNeg = true;
                if (hasHypertension && sodium > 500) isNeg = true;
                if (hasCholesterol && fat > 15) isNeg = true;

                // Universal fallbacks
                if (!isNeg) {
                    if (sugar > 25 || sodium > 800 || fat > 25) isNeg = true;
                    // Only mark as positive if we HAVE data and it's actually healthy
                    else if ((sugarRaw !== undefined || sodiumRaw !== undefined || fatRaw !== undefined) &&
                        sugar < 5 && sodium < 140 && fat < 5) isPos = true;
                }

                if (isNeg) neg.add(name);
                else if (isPos) pos.add(name);
                else neu.add(name);
            }
        });

        setHealthImpactLists({
            positive: Array.from(pos).slice(0, 8),
            negative: Array.from(neg).slice(0, 8),
            neutral: Array.from(neu).slice(0, 8)
        });

    }, [weeklyEntries, userPrefs]);


    useEffect(() => {
        if (weeklyData.length === 0 || !userPrefs) return;

        let recommendedDailyCals = 2000;
        if (userPrefs.weightGoal === 'lose') recommendedDailyCals = 1700;
        if (userPrefs.weightGoal === 'gain') recommendedDailyCals = 2500;

        const myActiveDaysCount = weeklyData.filter(d => d.calories > 0).length || 1;
        const totalActualCals = weeklyData.reduce((acc, curr) => acc + curr.calories, 0);
        const actualAvgPerDay = totalActualCals / myActiveDaysCount;

        const diff = actualAvgPerDay - recommendedDailyCals;
        const weeklySurplus = diff * myActiveDaysCount;

        if (diff > 150) {
            setWeightImpact({ indicator: 'Surplus', label: 'Weight Gain Risk', surplusDeficit: weeklySurplus });
        } else if (diff < -150) {
            setWeightImpact({ indicator: 'Deficit', label: 'Weight Loss Trend', surplusDeficit: weeklySurplus });
        } else {
            setWeightImpact({ indicator: 'Balanced', label: 'Maintaining Weight', surplusDeficit: weeklySurplus });
        }

    }, [weeklyData, userPrefs]);


    useEffect(() => {
        if (weeklyData.length === 0) return;
        const myActiveDaysCount = weeklyData.filter(d => d.calories > 0).length || 1;

        const avgSugar = weeklyData.reduce((acc, curr) => acc + curr.sugar, 0) / myActiveDaysCount;
        const avgFat = weeklyData.reduce((acc, curr) => acc + curr.fat, 0) / myActiveDaysCount;
        const avgProtein = weeklyData.reduce((acc, curr) => acc + curr.protein, 0) / myActiveDaysCount;

        let recs = [];
        if (avgSugar > 35) recs.push({ type: 'warning', text: 'Reduce sugary foods; your weekly average is high.' });
        if (avgFat > 70) recs.push({ type: 'warning', text: 'Consider balancing your meals to reduce fat intake.' });
        if (avgProtein < 40 && myActiveDaysCount > 1) recs.push({ type: 'info', text: 'Consider increasing protein-rich foods for better recovery.' });
        if (weightImpact.indicator === 'Surplus') recs.push({ type: 'warning', text: 'Your calorie intake is above recommended levels. Try adding light exercise.' });

        if (recs.length === 0 && myActiveDaysCount > 1) {
            recs.push({ type: 'success', text: 'Great job! Your weekly nutrition is well balanced.' });
        }

        setRecommendations(recs);

    }, [weeklyData, weightImpact]);


    const downloadPDFReport = async () => {
        if (!currentUser) return;
        setIsDownloadingPdf(true);

        try {
            const element = document.getElementById('pdf-report-container');
            if (!element) throw new Error("Report container not found");

            const canvas = await html2canvas(element, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#f8fafc'
            });

            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

            let heightLeft = pdfHeight;
            let position = 0;

            pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
            heightLeft -= pdf.internal.pageSize.getHeight();

            while (heightLeft >= 0) {
                position = heightLeft - pdfHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
                heightLeft -= pdf.internal.pageSize.getHeight();
            }

            const today = new Date().toLocaleDateString('en-CA');
            pdf.save(`Weekly_Health_Report_${userPrefs?.firstName || 'User'}_${today}.pdf`);

        } catch (error) {
            console.error("Error generating PDF:", error);
        } finally {
            setIsDownloadingPdf(false);
        }
    };

    if (loading) {
        return <div style={{ display: 'flex', justifyContent: 'center', marginTop: '100px', fontSize: '1.2rem', color: '#64748b' }}>Analyzing Weekly Data...</div>;
    }

    return (
        <div style={{ position: 'relative', minHeight: '100vh', width: '100%', overflow: 'hidden', background: '#f8fafc' }}>
            <Particles
                quantity={80}
                staticity={30}
                ease={50}
                color="#3b82f6"
                style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0 }}
            />
            <div style={{ position: 'relative', zIndex: 1, padding: '2rem 4rem 4rem 4rem', maxWidth: '1440px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }}>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', position: 'relative' }}>
                    <div
                        style={{ display: 'flex', flexDirection: 'column', gap: '4px', cursor: 'pointer', userSelect: 'none' }}
                        onClick={() => setShowCalendar(!showCalendar)}
                    >
                        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#1e293b', margin: 0 }}>Detailed Weekly Report</h1>
                        <div style={{ fontSize: '1rem', color: '#64748b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '1.2rem' }}>🗓️</span>
                            Week: <span style={{ color: '#3b82f6' }}>{weekRangeString}</span>
                        </div>
                    </div>

                    {/* Glassy Calendar Popup */}
                    {showCalendar && (
                        <div style={{
                            position: 'absolute',
                            top: '100%',
                            left: 0,
                            marginTop: '12px',
                            zIndex: 1000,
                            animation: 'fadeInScale 0.2s ease-out'
                        }}>
                            <GlassCalendar
                                nutritionData={calendarNutritionData}
                                onDateSelect={(date) => {
                                    const dateKey = date.toLocaleDateString('en-CA');
                                    const stats = heatmapDailyStats[dateKey];
                                    if (stats && stats.calories > 0) {
                                        const dayInfo = calendarNutritionData[dateKey];
                                        if (dayInfo) {
                                            setSelectedDayData({
                                                date: dateKey,
                                                calories: Math.round(dayInfo.calories),
                                                protein: Math.round(dayInfo.protein),
                                                carbs: Math.round(dayInfo.carbs),
                                                fat: Math.round(dayInfo.fat),
                                                scoreLabel: dayInfo.statusLabel,
                                                targetGoal: dayInfo.targetGoal
                                            });
                                            setShowDayDetail(true);
                                        }
                                    }
                                }}
                                onClose={() => setShowCalendar(false)}
                            />

                            {/* Day Detail Popup overlay */}
                            {showDayDetail && selectedDayData && (
                                <div
                                    style={{
                                        position: 'fixed',
                                        inset: 0,
                                        background: 'rgba(0,0,0,0.1)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        zIndex: 1100
                                    }}
                                    onClick={() => setShowDayDetail(false)}
                                >
                                    <div
                                        style={{
                                            background: 'rgba(255, 255, 255, 0.8)',
                                            backdropFilter: 'blur(20px)',
                                            padding: '24px',
                                            borderRadius: '24px',
                                            width: '280px',
                                            boxShadow: '0 20px 40px rgba(0,0,0,0.1)',
                                            border: '1px solid rgba(255,255,255,0.5)',
                                            animation: 'scaleIn 0.3s ease-out'
                                        }}
                                        onClick={e => e.stopPropagation()}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                                            <h4 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: '#1e293b' }}>
                                                {new Date(selectedDayData.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                            </h4>
                                            <button onClick={() => setShowDayDetail(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
                                        </div>

                                        <div style={{ display: 'grid', gap: '12px' }}>
                                            {[
                                                { label: 'Calories', val: `${selectedDayData.calories} / ${selectedDayData.targetGoal} kcal`, color: '#3b82f6' },
                                                { label: 'Protein', val: `${selectedDayData.protein}g`, color: '#10b981' },
                                                { label: 'Carbs', val: `${selectedDayData.carbs}g`, color: '#f59e0b' },
                                                { label: 'Fat', val: `${selectedDayData.fat}g`, color: '#8b5cf6' },
                                                { label: 'Status', val: selectedDayData.scoreLabel, color: selectedDayData.scoreLabel === 'Healthy' ? '#22c55e' : (selectedDayData.scoreLabel === 'Moderate' ? '#eab308' : '#ef4444') }
                                            ].map(item => (
                                                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', background: 'rgba(255,255,255,0.4)', borderRadius: '12px' }}>
                                                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#64748b' }}>{item.label}</span>
                                                    <span style={{ fontSize: '0.95rem', fontWeight: 700, color: item.color }}>{item.val}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            <style>{`
                                @keyframes scaleIn {
                                    from { transform: scale(0.9); opacity: 0; }
                                    to { transform: scale(1); opacity: 1; }
                                }
                            `}</style>
                        </div>
                    )}
                    <button
                        onClick={downloadPDFReport}
                        disabled={isDownloadingPdf}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '12px 24px',
                            background: isDownloadingPdf ? '#cbd5e1' : 'linear-gradient(135deg, rgba(30, 41, 59, 1), rgba(15, 23, 42, 1))',
                            color: 'white',
                            fontWeight: 600,
                            border: 'none',
                            borderRadius: '50px',
                            cursor: isDownloadingPdf ? 'not-allowed' : 'pointer',
                            boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
                            transition: 'all 0.3s ease',
                            fontSize: '0.95rem'
                        }}
                    >
                        <span>{isDownloadingPdf ? '⏳' : '📥'}</span>
                        {isDownloadingPdf ? 'Generating PDF...' : 'Download Report Document'}
                    </button>
                </div>

                <div id="pdf-report-container" style={{ display: 'flex', flexDirection: 'column', gap: '32px', background: 'rgba(248, 250, 252, 0.4)', backdropFilter: 'blur(8px)', padding: '16px', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.4)' }}>
                    {/* 1. WEEKLY NUTRITION OVERVIEW */}
                    <div className="card" style={{ padding: '32px', background: 'rgba(255, 255, 255, 0.3)', backdropFilter: 'blur(12px)', borderRadius: '24px', border: '1px solid rgba(255, 255, 255, 0.6)', boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.05)' }}>
                        <h3 style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.25rem', fontWeight: 700, color: '#1e293b' }}>
                            <span style={{ fontSize: '1.5rem' }}>📅</span> Weekly Nutrition Overview
                        </h3>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', justifyContent: 'space-between' }}>

                            <div style={{ flex: '1 1 auto', minWidth: '140px', background: 'rgba(255, 255, 255, 0.6)', padding: '20px', borderRadius: '20px', border: '1px solid rgba(255, 255, 255, 0.8)' }}>
                                <div style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '8px', fontWeight: 600 }}>Total Calories</div>
                                <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '1.8rem' }}>
                                    {weeklyData.reduce((acc, curr) => acc + curr.calories, 0).toLocaleString()} <span style={{ fontSize: '1rem', color: '#94a3b8', fontWeight: 500 }}>kcal</span>
                                </div>
                            </div>

                            <div style={{ flex: '1 1 auto', minWidth: '120px', background: 'rgba(255, 255, 255, 0.6)', padding: '20px', borderRadius: '20px', border: '1px solid rgba(255, 255, 255, 0.8)' }}>
                                <div style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '8px', fontWeight: 600 }}>Avg Protein</div>
                                <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '1.8rem' }}>
                                    {weeklyData.length > 0 ? Math.round(weeklyData.reduce((acc, curr) => acc + curr.protein, 0) / 7) : 0} <span style={{ fontSize: '1rem', color: '#94a3b8', fontWeight: 500 }}>g</span>
                                </div>
                            </div>

                            <div style={{ flex: '1 1 auto', minWidth: '120px', background: 'rgba(255, 255, 255, 0.6)', padding: '20px', borderRadius: '20px', border: '1px solid rgba(255, 255, 255, 0.8)' }}>
                                <div style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '8px', fontWeight: 600 }}>Avg Carbs</div>
                                <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '1.8rem' }}>
                                    {weeklyData.length > 0 ? Math.round(weeklyData.reduce((acc, curr) => acc + curr.carbs, 0) / 7) : 0} <span style={{ fontSize: '1rem', color: '#94a3b8', fontWeight: 500 }}>g</span>
                                </div>
                            </div>

                            <div style={{ flex: '1 1 auto', minWidth: '120px', background: 'rgba(255, 255, 255, 0.6)', padding: '20px', borderRadius: '20px', border: '1px solid rgba(255, 255, 255, 0.8)' }}>
                                <div style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '8px', fontWeight: 600 }}>Avg Fat</div>
                                <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '1.8rem' }}>
                                    {weeklyData.length > 0 ? Math.round(weeklyData.reduce((acc, curr) => acc + curr.fat, 0) / 7) : 0} <span style={{ fontSize: '1rem', color: '#94a3b8', fontWeight: 500 }}>g</span>
                                </div>
                            </div>

                            <div style={{ flex: '1 1 auto', minWidth: '120px', background: 'rgba(255, 255, 255, 0.6)', padding: '20px', borderRadius: '20px', border: '1px solid rgba(255, 255, 255, 0.8)' }}>
                                <div style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '8px', fontWeight: 600 }}>Avg Sugar</div>
                                <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '1.8rem' }}>
                                    {weeklyData.length > 0 ? Math.round(weeklyData.reduce((acc, curr) => acc + curr.sugar, 0) / 7) : 0} <span style={{ fontSize: '1rem', color: '#94a3b8', fontWeight: 500 }}>g</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 2-COLUMN GRID: Risk Analysis & Food Impact */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '32px' }}>

                        {/* 2. HEALTH RISK ANALYSIS (WEIGHT) */}
                        <div className="card" style={{ padding: '32px', display: 'flex', flexDirection: 'column', background: 'rgba(255, 255, 255, 0.45)', backdropFilter: 'blur(24px)', borderRadius: '24px', border: '1px solid rgba(255, 255, 255, 0.6)', boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.07)' }}>
                            <h3 style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.25rem', fontWeight: 700, color: '#1e293b' }}>
                                <span style={{ fontSize: '1.5rem' }}>⚖️</span> Weight Impact Analysis
                            </h3>
                            <div style={{
                                flex: 1,
                                display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                                padding: '32px',
                                background: weightImpact.indicator === 'Surplus' ? 'rgba(254, 242, 242, 0.8)' : weightImpact.indicator === 'Deficit' ? 'rgba(240, 253, 250, 0.8)' : 'rgba(240, 253, 244, 0.8)',
                                border: `1px solid ${weightImpact.indicator === 'Surplus' ? '#fecaca' : weightImpact.indicator === 'Deficit' ? '#ccfbf1' : '#bbf7d0'}`,
                                borderRadius: '20px',
                                textAlign: 'center'
                            }}>
                                <div style={{ fontSize: '4rem', marginBottom: '16px' }}>
                                    {weightImpact.indicator === 'Surplus' ? '📈' : weightImpact.indicator === 'Deficit' ? '📉' : '⚖️'}
                                </div>
                                <div style={{
                                    fontWeight: 700,
                                    color: weightImpact.indicator === 'Surplus' ? '#b91c1c' : weightImpact.indicator === 'Deficit' ? '#0f766e' : '#15803d',
                                    fontSize: '1.5rem',
                                    marginBottom: '16px'
                                }}>
                                    {weightImpact.label}
                                </div>
                                <div style={{
                                    fontWeight: 800,
                                    color: weightImpact.indicator === 'Surplus' ? '#ef4444' : weightImpact.indicator === 'Deficit' ? '#14b8a6' : '#22c55e',
                                    fontSize: '2.5rem'
                                }}>
                                    {weightImpact.surplusDeficit > 0 ? '+' : ''}{Math.round(weightImpact.surplusDeficit).toLocaleString()} <span style={{ fontSize: '1.1rem', fontWeight: 600 }}>kcal</span>
                                </div>
                                <div style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 600, marginTop: '12px', letterSpacing: '0.05em' }}>VERSUS RECOMMENDED</div>
                            </div>
                        </div>

                        {/* 3. FOOD IMPACT SUMMARY */}
                        <div className="card" style={{ padding: '32px', background: 'rgba(255, 255, 255, 0.45)', backdropFilter: 'blur(24px)', borderRadius: '24px', border: '1px solid rgba(255, 255, 255, 0.6)', boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.07)' }}>
                            <h3 style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.25rem', fontWeight: 700, color: '#1e293b' }}>
                                <span style={{ fontSize: '1.5rem' }}>🥗</span> Food Impact Summary
                            </h3>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                <div style={{ background: 'rgba(255, 255, 255, 0.6)', padding: '20px', borderRadius: '20px', border: '1px solid rgba(255, 255, 255, 0.8)' }}>
                                    <div style={{ fontSize: '0.95rem', color: '#64748b', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}><span style={{ fontSize: '1.3rem' }}>🍏</span> Positive Impact Foods</div>
                                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                        {healthImpactLists.positive.length > 0 ? healthImpactLists.positive.map(food => (
                                            <span key={`pos-${food}`} style={{ background: '#10b98115', color: '#10b981', padding: '8px 16px', borderRadius: '24px', fontSize: '0.9rem', fontWeight: 600, border: '1px solid rgba(16,185,129,0.2)' }}>{food}</span>
                                        )) : <span style={{ fontSize: '0.9rem', color: '#cbd5e1', fontStyle: 'italic' }}>None logged</span>}
                                    </div>
                                </div>

                                <div style={{ background: 'rgba(255, 255, 255, 0.6)', padding: '20px', borderRadius: '20px', border: '1px solid rgba(255, 255, 255, 0.8)' }}>
                                    <div style={{ fontSize: '0.95rem', color: '#64748b', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}><span style={{ fontSize: '1.3rem' }}>⚠️</span> Negative Impact Foods</div>
                                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                        {healthImpactLists.negative.length > 0 ? healthImpactLists.negative.map(food => (
                                            <span key={`neg-${food}`} style={{ background: '#ef444415', color: '#ef4444', padding: '8px 16px', borderRadius: '24px', fontSize: '0.9rem', fontWeight: 600, border: '1px solid rgba(239,68,68,0.2)' }}>{food}</span>
                                        )) : <span style={{ fontSize: '0.9rem', color: '#cbd5e1', fontStyle: 'italic' }}>None logged</span>}
                                    </div>
                                </div>

                                <div style={{ background: 'rgba(255, 255, 255, 0.6)', padding: '20px', borderRadius: '20px', border: '1px solid rgba(255, 255, 255, 0.8)' }}>
                                    <div style={{ fontSize: '0.95rem', color: '#64748b', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}><span style={{ fontSize: '1.3rem' }}>⚪</span> Neutral Foods</div>
                                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                        {healthImpactLists.neutral.length > 0 ? healthImpactLists.neutral.map(food => (
                                            <span key={`neu-${food}`} style={{ background: '#f8fafc', color: '#64748b', padding: '8px 16px', borderRadius: '24px', fontSize: '0.9rem', fontWeight: 600, border: '1px solid #e2e8f0' }}>{food}</span>
                                        )) : <span style={{ fontSize: '0.9rem', color: '#cbd5e1', fontStyle: 'italic' }}>None logged</span>}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 4. RECOMMENDATIONS */}
                    <div className="card" style={{ padding: '32px', background: 'rgba(255, 255, 255, 0.45)', backdropFilter: 'blur(24px)', borderRadius: '24px', border: '1px solid rgba(255, 255, 255, 0.6)', boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.07)' }}>
                        <h3 style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.25rem', fontWeight: 700, color: '#1e293b' }}>
                            <span style={{ fontSize: '1.5rem' }}>💡</span> Intelligent Recommendations
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                            {recommendations.length > 0 ? recommendations.map((rec, idx) => (
                                <div key={idx} style={{
                                    display: 'flex', alignItems: 'flex-start', gap: '16px',
                                    padding: '24px',
                                    borderRadius: '20px',
                                    background: rec.type === 'warning' ? 'rgba(255, 251, 235, 0.8)' : rec.type === 'info' ? 'rgba(239, 246, 255, 0.8)' : 'rgba(240, 253, 244, 0.8)',
                                    border: `1px solid ${rec.type === 'warning' ? '#fcd34d' : rec.type === 'info' ? '#bfdbfe' : '#bbf7d0'}`,
                                    borderLeft: `6px solid ${rec.type === 'warning' ? '#f59e0b' : rec.type === 'info' ? '#3b82f6' : '#22c55e'}`,
                                    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.02)'
                                }}>
                                    <span style={{ fontSize: '1.8rem', marginTop: '-4px' }}>
                                        {rec.type === 'warning' ? '⚡' : rec.type === 'info' ? 'ℹ️' : '🌟'}
                                    </span>
                                    <span style={{ fontSize: '1.05rem', color: '#334155', fontWeight: 600, lineHeight: '1.5' }}>
                                        {rec.text}
                                    </span>
                                </div>
                            )) : (
                                <div style={{ background: 'rgba(255, 255, 255, 0.6)', padding: '32px', borderRadius: '20px', textAlign: 'center', gridColumn: '1 / -1' }}>
                                    <span style={{ fontSize: '1rem', color: '#64748b', fontStyle: 'italic' }}>
                                        Log more food for personalized weekly recommendations.
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 5. VISUAL ANALYTICS */}
                    <div className="card" style={{ padding: '32px', position: 'relative', overflow: 'hidden', background: 'rgba(255, 255, 255, 0.45)', backdropFilter: 'blur(24px)', borderRadius: '24px', border: '1px solid rgba(255, 255, 255, 0.6)', boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.07)' }}>
                        <h3 style={{ marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.25rem', fontWeight: 700, color: '#1e293b' }}>
                            <span style={{ fontSize: '1.5rem' }}>📊</span> Visual Analytics
                        </h3>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '32px' }}>

                            {/* Weekly Calorie Trend */}
                            <div style={{ background: 'rgba(255, 255, 255, 0.7)', border: '1px solid rgba(255,255,255,0.9)', padding: '24px', borderRadius: '24px', boxShadow: '0 4px 15px rgba(0,0,0,0.02)' }}>
                                <h4 style={{ color: '#475569', fontSize: '1rem', marginBottom: '24px', textAlign: 'center', fontWeight: 700 }}>Weekly Calorie Trend</h4>
                                <div style={{ height: '300px' }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={weeklyData}>
                                            <XAxis dataKey="name" stroke="#94a3b8" fontSize={13} tickLine={false} axisLine={false} />
                                            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)', background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)' }} />
                                            <Line type="monotone" dataKey="calories" stroke="#3b82f6" strokeWidth={4} dot={{ fill: '#3b82f6', strokeWidth: 2, r: 5 }} activeDot={{ r: 7, strokeWidth: 0, fill: '#3b82f6' }} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Daily Calorie Intake */}
                            <div style={{ background: 'rgba(255, 255, 255, 0.7)', border: '1px solid rgba(255,255,255,0.9)', padding: '24px', borderRadius: '24px', boxShadow: '0 4px 15px rgba(0,0,0,0.02)' }}>
                                <h4 style={{ color: '#475569', fontSize: '1rem', marginBottom: '24px', textAlign: 'center', fontWeight: 700 }}>Daily Calorie Intake</h4>
                                <div style={{ height: '300px' }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={weeklyData}>
                                            <XAxis dataKey="name" stroke="#94a3b8" fontSize={13} tickLine={false} axisLine={false} />
                                            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)', background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)' }} cursor={{ fill: 'rgba(241, 245, 249, 0.5)' }} />
                                            <Bar dataKey="calories" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Macro Nutrient Distribution */}
                            <div style={{ background: 'rgba(255, 255, 255, 0.7)', border: '1px solid rgba(255,255,255,0.9)', padding: '24px', borderRadius: '24px', gridColumn: '1 / -1', boxShadow: '0 4px 15px rgba(0,0,0,0.02)' }}>
                                <h4 style={{ color: '#475569', fontSize: '1rem', marginBottom: '24px', textAlign: 'center', fontWeight: 700 }}>Macro Nutrient Distribution</h4>
                                <div style={{ height: '350px' }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={weeklyData}>
                                            <XAxis dataKey="name" stroke="#94a3b8" fontSize={13} tickLine={false} axisLine={false} />
                                            <YAxis stroke="#94a3b8" fontSize={13} tickLine={false} axisLine={false} />
                                            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)', background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)' }} cursor={{ fill: 'rgba(241, 245, 249, 0.5)' }} />
                                            <Legend wrapperStyle={{ fontSize: '14px', paddingTop: '10px' }} />
                                            <Bar dataKey="protein" stackId="a" fill="#3b82f6" name="Protein (g)" />
                                            <Bar dataKey="carbs" stackId="a" fill="#10b981" name="Carbs (g)" />
                                            <Bar dataKey="fat" stackId="a" fill="#f59e0b" name="Fat (g)" />
                                            <Bar dataKey="sugar" stackId="a" fill="#ef4444" name="Sugar (g)" radius={[8, 8, 0, 0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Health Risk Impact Chart (Pie Chart) */}
                            <div style={{ background: 'rgba(255, 255, 255, 0.7)', border: '1px solid rgba(255,255,255,0.9)', padding: '24px', borderRadius: '24px', gridColumn: '1 / -1', boxShadow: '0 4px 15px rgba(0,0,0,0.02)' }}>
                                <h4 style={{ color: '#475569', fontSize: '1rem', marginBottom: '24px', textAlign: 'center', fontWeight: 700 }}>Weekly Health Risk Impact</h4>
                                <div style={{ height: '350px', display: 'flex', justifyContent: 'center' }}>
                                    <ResponsiveContainer width="100%" height="100%" minWidth={300} maxWidth={500}>
                                        <PieChart>
                                            <Pie
                                                data={[
                                                    { name: 'Positive', value: healthImpactLists.positive.length },
                                                    { name: 'Neutral', value: healthImpactLists.neutral.length },
                                                    { name: 'Negative', value: healthImpactLists.negative.length },
                                                ]}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={90}
                                                outerRadius={120}
                                                paddingAngle={5}
                                                dataKey="value"
                                                stroke="none"
                                                cornerRadius={8}
                                            >
                                                <Cell key="cell-0" fill="#10b981" style={{ filter: 'drop-shadow(0px 4px 6px rgba(16,185,129,0.2))' }} />
                                                <Cell key="cell-1" fill="#cbd5e1" style={{ filter: 'drop-shadow(0px 4px 6px rgba(100,116,139,0.1))' }} />
                                                <Cell key="cell-2" fill="#ef4444" style={{ filter: 'drop-shadow(0px 4px 6px rgba(239,68,68,0.2))' }} />
                                            </Pie>
                                            <Tooltip
                                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgb(0 0 0 / 0.1)', background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)' }}
                                                formatter={(value) => [`${value} items`, 'Count']}
                                            />
                                            <Legend wrapperStyle={{ fontSize: '14px', paddingTop: '10px' }} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
