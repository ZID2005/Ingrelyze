import React, { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { db } from "../firebase";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import { LineChart, Line, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { PageLoader, ButtonSpinner } from '../components/Spinner';
import Particles from "../components/Particles";
import { GlassCalendar } from "../components/GlassCalendar";

// Helper components for the icons used in sections (so they can be reused in dialogs)
const Icons = {
    overview: <span style={{ fontSize: '1.5rem' }}>📅</span>,
    weight: <span style={{ fontSize: '1.5rem' }}>⚖️</span>,
    impact: <span style={{ fontSize: '1.5rem' }}>🥗</span>,
    recs: <span style={{ fontSize: '1.5rem' }}>💡</span>,
    analytics: <span style={{ fontSize: '1.5rem' }}>📊</span>
};

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
    
    // State for the full-screen section dialog
    const [expandedSection, setExpandedSection] = useState(null); // 'overview', 'weight', 'impact', 'recs', 'analytics'

    useEffect(() => {
        if (expandedSection) {
            document.body.style.overflow = 'hidden';
            // Prevent layout shift by adding padding
            const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
            document.body.style.paddingRight = `${scrollbarWidth}px`;
        } else {
            document.body.style.overflow = '';
            document.body.style.paddingRight = '';
        }
        return () => { 
            document.body.style.overflow = ''; 
            document.body.style.paddingRight = '';
        };
    }, [expandedSection]);

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
                // Minimum display time so the spinner is visible
                await new Promise(r => setTimeout(r, 800));
                setLoading(false);
            }
        }
        fetchWeeklyTotals();
        const intervalId = setInterval(fetchWeeklyTotals, 300000); // refresh 5 mins
        return () => clearInterval(intervalId);
    }, [currentUser]);

    // Derived Analytics Logic
    useEffect(() => {
        if (!weeklyEntries.length) return;

        // Use a Map to track the WORST (highest) healthLevel seen for each food.
        // This ensures each food ends up in exactly ONE category (no duplicates across lists).
        const foodWorstLevel = new Map(); // foodName -> worst numeric level (0–4)

        weeklyEntries.forEach(entry => {
            if (!entry || !entry.foodName) return;
            const name = entry.foodName;

            let level;

            if (entry.healthLevel !== undefined && entry.healthLevel !== null) {
                // Use the backend-provided healthLevel (already accounts for user risk profile)
                level = Number(entry.healthLevel);
            } else {
                // Heuristic fallback for historical entries that are missing healthLevel
                const sugar = Number(entry.sugar || entry.fullNutrients?.sugar || 0);
                const sodium = Number(entry.sodium || entry.fullNutrients?.sodium || 0);
                const fat = Number(entry.fat || entry.fullNutrients?.fat || 0);

                const hasDiabetes = userPrefs?.diabetes === "High" || userPrefs?.diabetes === "Medium";
                const hasHypertension = userPrefs?.hypertension === "High" || userPrefs?.hypertension === "Medium";
                const hasCholesterol = userPrefs?.cholesterol === "High" || userPrefs?.cholesterol === "Medium";

                let isNeg = false;
                let isPos = false;

                // Risk-condition-aware checks
                if (hasDiabetes && sugar > 10) isNeg = true;
                if (hasHypertension && sodium > 400) isNeg = true;
                if (hasCholesterol && fat > 10) isNeg = true;

                // Universal thresholds (tightened to catch clearly unhealthy foods)
                if (!isNeg) {
                    if (sugar > 20 || sodium > 600 || fat > 20) {
                        isNeg = true;
                    } else if (sugar < 5 && sodium < 140 && fat < 5) {
                        isPos = true;
                    }
                }

                // Map to a numeric level: 0=positive, 2=neutral, 4=negative
                level = isNeg ? 4 : isPos ? 0 : 2;
            }

            // Keep the worst level seen for this food across all logged entries
            const currentWorst = foodWorstLevel.get(name) ?? -1;
            if (level > currentWorst) {
                foodWorstLevel.set(name, level);
            }
        });

        // Classify each food exactly once based on its worst level
        const pos = [];
        const neg = [];
        const neu = [];

        foodWorstLevel.forEach((level, name) => {
            if (level <= 1) pos.push(name);
            else if (level >= 3) neg.push(name);
            else neu.push(name);
        });

        setHealthImpactLists({
            positive: pos.slice(0, 8),
            negative: neg.slice(0, 8),
            neutral: neu.slice(0, 8),
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
            // Give Recharts in the hidden container a moment to render completely
            await new Promise(r => setTimeout(r, 800));

            const element = document.getElementById('hidden-pdf-report');
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

            // Only add a new page if we visibly overflow by more than 1mm (prevents unwanted blank pages)
            while (heightLeft > 1) {
                position = heightLeft - pdfHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
                heightLeft -= pdf.internal.pageSize.getHeight();
            }

            const today = new Date().toLocaleDateString('en-CA');
            const safeName = (userPrefs?.name || 'User').replace(/[^a-z0-9]/gi, '_');
            pdf.save(`Weekly_Health_Report_${safeName}_${today}.pdf`);

        } catch (error) {
            console.error("Error generating PDF:", error);
        } finally {
            setIsDownloadingPdf(false);
        }
    };

    if (loading) {
        return <PageLoader text="Analyzing Weekly Data..." color="#3b82f6" />;
    }

    return (
        <div style={{ position: 'relative', minHeight: '100vh', width: '100%', overflow: 'hidden', background: '#f8fafc' }}>
            {/* HIDDEN PRINTABLE PDF CONTAINER */}
            <div id="hidden-pdf-report" style={{ position: 'absolute', left: '-9999px', top: 0, width: '794px', background: 'white', color: '#0f172a', fontFamily: 'Arial, sans-serif' }}>
                
                {/* --- PAGE 1 --- */}
                <div style={{ width: '794px', height: '1123px', padding: '40px 50px', boxSizing: 'border-box', position: 'relative' }}>
                    {/* Header - Clinical Style */}
                    <div style={{ borderBottom: '3px solid #1e293b', paddingBottom: '20px', marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <h1 style={{ margin: 0, fontSize: '30px', color: '#0f172a', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px' }}>Ingrelyze</h1>
                            <h2 style={{ margin: '4px 0 12px 0', fontSize: '16px', color: '#3b82f6', fontWeight: 700, textTransform: 'uppercase' }}>Comprehensive Health & Nutrition Report</h2>
                            <div style={{ fontSize: '13px', color: '#334155', lineHeight: '1.6' }}>
                                <div><span style={{color: '#64748b'}}>Patient / User:</span> <strong style={{color: '#0f172a'}}>{userPrefs?.name || 'User'}</strong></div>
                                <div><span style={{color: '#64748b'}}>Demographics:</span> <strong style={{color: '#0f172a'}}>{userPrefs?.age || 'N/A'} yrs &bull; {userPrefs?.gender || 'N/A'}</strong></div>
                            </div>
                        </div>
                        <div style={{ textAlign: 'right', fontSize: '13px', color: '#334155', lineHeight: '1.6', paddingTop: '4px' }}>
                            <div style={{ marginBottom: '8px' }}>
                                <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date Range</span><br/>
                                <strong style={{color: '#0f172a', fontSize: '15px'}}>{weekRangeString}</strong>
                            </div>
                            <div>
                                <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Generated On</span><br/>
                                <strong style={{color: '#0f172a'}}>{new Date().toLocaleDateString('en-US')}</strong>
                            </div>
                        </div>
                    </div>

                    {/* Overview Stats */}
                    <h2 style={{ fontSize: '16px', color: '#1e293b', borderBottom: '2px solid #e2e8f0', paddingBottom: '6px', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Weekly Overview</h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', marginBottom: '36px' }}>
                        {[
                            { label: 'Total Calories', value: weeklyData.reduce((a,c) => a+c.calories, 0).toLocaleString(), unit: 'kcal' },
                            { label: 'Avg Protein', value: weeklyData.length > 0 ? Math.round(weeklyData.reduce((a,c) => a+c.protein,0)/7) : 0, unit: 'g' },
                            { label: 'Avg Carbs', value: weeklyData.length > 0 ? Math.round(weeklyData.reduce((a,c) => a+c.carbs,0)/7) : 0, unit: 'g' },
                            { label: 'Avg Fat', value: weeklyData.length > 0 ? Math.round(weeklyData.reduce((a,c) => a+c.fat,0)/7) : 0, unit: 'g' },
                            { label: 'Avg Sugar', value: weeklyData.length > 0 ? Math.round(weeklyData.reduce((a,c) => a+c.sugar,0)/7) : 0, unit: 'g' },
                        ].map(stat => (
                            <div key={stat.label} style={{ background: '#f8fafc', padding: '14px', borderRadius: '4px', textAlign: 'center', border: '1px solid #cbd5e1' }}>
                                <div style={{ color: '#475569', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>{stat.label}</div>
                                <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '20px' }}>{stat.value} <span style={{ fontSize: '11px', color: '#64748b' }}>{stat.unit}</span></div>
                            </div>
                        ))}
                    </div>

                    {/* Impacts */}
                    <h2 style={{ fontSize: '16px', color: '#1e293b', borderBottom: '2px solid #e2e8f0', paddingBottom: '6px', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Health & Weight Impact</h2>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '36px' }}>
                        <div style={{ border: '1px solid #cbd5e1', padding: '20px', borderRadius: '4px', background: '#f8fafc' }}>
                            <h3 style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#334155', textTransform: 'uppercase' }}>Weight Impact Analysis</h3>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                <div style={{ fontSize: '32px' }}>{weightImpact.indicator === 'Surplus' ? '📈' : weightImpact.indicator === 'Deficit' ? '📉' : '⚖️'}</div>
                                <div>
                                    <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '16px' }}>{weightImpact.label}</div>
                                    <div style={{ fontWeight: 700, color: weightImpact.indicator === 'Surplus' ? '#b91c1c' : weightImpact.indicator === 'Deficit' ? '#0f766e' : '#15803d', fontSize: '18px' }}>
                                        {weightImpact.surplusDeficit > 0 ? '+' : ''}{Math.round(weightImpact.surplusDeficit).toLocaleString()} kcal/week
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div style={{ border: '1px solid #cbd5e1', padding: '20px', borderRadius: '4px', background: '#f8fafc' }}>
                            <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', color: '#334155', textTransform: 'uppercase' }}>Key Food Impacts</h3>
                            <div style={{ fontSize: '13px', color: '#334155', lineHeight: '1.7' }}>
                                <strong>Positive Highlight:</strong> {healthImpactLists.positive.length > 0 ? healthImpactLists.positive.join(', ') : 'None'}<br/>
                                <strong style={{ color: '#b91c1c' }}>Risk Highlight:</strong> {healthImpactLists.negative.length > 0 ? healthImpactLists.negative.join(', ') : 'None'}
                            </div>
                        </div>
                    </div>

                    {/* Recommendations */}
                    <h2 style={{ fontSize: '16px', color: '#1e293b', borderBottom: '2px solid #e2e8f0', paddingBottom: '6px', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Targeted Recommendations</h2>
                    <div style={{ marginBottom: '30px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {recommendations.length > 0 ? recommendations.map((rec, idx) => (
                            <div key={idx} style={{ padding: '14px', background: '#f8fafc', borderLeft: `5px solid ${rec.type === 'warning' ? '#f59e0b' : rec.type === 'info' ? '#3b82f6' : '#22c55e'}`, borderTop: '1px solid #cbd5e1', borderRight: '1px solid #cbd5e1', borderBottom: '1px solid #cbd5e1', borderRadius: '0 4px 4px 0', fontSize: '14px', color: '#1e293b', fontWeight: 500, lineHeight: 1.5 }}>
                                {rec.text}
                            </div>
                        )) : (
                            <div style={{ fontSize: '14px', color: '#64748b', fontStyle: 'italic', padding: '16px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '4px' }}>No specific interventions required for this period. Maintain consistent behavior.</div>
                        )}
                    </div>

                    {/* Footer pinned to bottom of page 1 */}
                    <div style={{ position: 'absolute', bottom: '40px', left: '50px', right: '50px', paddingTop: '16px', borderTop: '2px solid #e2e8f0', textAlign: 'center', fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Confidential Medical / Health Data &bull; Generated by Ingrelyze &bull; Page 1 of 2
                    </div>
                </div>

                {/* --- PAGE 2 --- */}
                <div style={{ width: '794px', height: '1123px', padding: '40px 50px', boxSizing: 'border-box', position: 'relative' }}>
                    <h2 style={{ fontSize: '16px', color: '#1e293b', borderBottom: '2px solid #e2e8f0', paddingBottom: '6px', marginBottom: '30px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Visual Analytics (Continued)</h2>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
                        <div style={{ border: '1px solid #cbd5e1', padding: '30px', borderRadius: '4px', background: '#f8fafc' }}>
                            <h4 style={{ margin: '0 0 20px 0', fontSize: '15px', color: '#334155', textAlign: 'center', fontWeight: 700, textTransform: 'uppercase' }}>Weekly Calorie Trend (kcal)</h4>
                            <div style={{ height: '320px' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={weeklyData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                                        <XAxis dataKey="name" stroke="#94a3b8" fontSize={13} tickLine={false} axisLine={false} />
                                        <YAxis stroke="#94a3b8" fontSize={13} tickLine={false} axisLine={false} />
                                        <Tooltip
                                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.95)' }}
                                            formatter={(val) => `${Math.round(val)} kcal`}
                                        />
                                        <Line type="monotone" isAnimationActive={false} dataKey="calories" stroke="#3b82f6" strokeWidth={3} dot={{ fill: '#3b82f6', r: 4 }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div style={{ border: '1px solid #cbd5e1', padding: '30px', borderRadius: '4px', background: '#f8fafc' }}>
                            <h4 style={{ margin: '0 0 20px 0', fontSize: '15px', color: '#334155', textAlign: 'center', fontWeight: 700, textTransform: 'uppercase' }}>Macro Nutrient Distribution (grams)</h4>
                            <div style={{ height: '320px' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={weeklyData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                                        <XAxis dataKey="name" stroke="#94a3b8" fontSize={13} tickLine={false} axisLine={false} />
                                        <YAxis stroke="#94a3b8" fontSize={13} tickLine={false} axisLine={false} />
                                        <Tooltip
                                            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.95)' }}
                                            formatter={(val) => `${Number(val).toFixed(1)}g`}
                                        />
                                        <Legend wrapperStyle={{ fontSize: '13px', paddingTop: '10px' }} />
                                        <Bar dataKey="protein" isAnimationActive={false} stackId="a" fill="#3b82f6" name="Protein (g)" />
                                        <Bar dataKey="carbs" isAnimationActive={false} stackId="a" fill="#10b981" name="Carbs (g)" />
                                        <Bar dataKey="fat" isAnimationActive={false} stackId="a" fill="#f59e0b" name="Fat (g)" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                    
                    {/* Footer pinned to bottom of page 2 */}
                    <div style={{ position: 'absolute', bottom: '40px', left: '50px', right: '50px', paddingTop: '16px', borderTop: '2px solid #e2e8f0', textAlign: 'center', fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Confidential Medical / Health Data &bull; Generated by Ingrelyze &bull; Page 2 of 2
                    </div>
                </div>
            </div>

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
                        style={{ display: 'flex', flexDirection: 'column', gap: '6px', cursor: 'pointer', userSelect: 'none' }}
                        onClick={() => setShowCalendar(!showCalendar)}
                    >
                        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#1e293b', margin: 0, lineHeight: 1.2 }}>Detailed Weekly Report</h1>
                        <div style={{ fontSize: '1rem', color: '#64748b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', lineHeight: 1 }}>
                            <span style={{ fontSize: '1.1rem' }}>🗓️</span>
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
                            fontSize: '0.95rem',
                            alignSelf: 'center',
                            flexShrink: 0,
                            whiteSpace: 'nowrap'
                        }}
                    >
                        {isDownloadingPdf ? <ButtonSpinner text="Generating PDF..." color="#ffffff" /> : <><span>📥</span> Download Report Document</>}
                    </button>
                </div>

                <div id="pdf-report-container" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>

                    {/* 1. WEEKLY NUTRITION OVERVIEW - full width */}
                    <div
                        className="report-card"
                        style={{ gridColumn: '1 / -1', padding: '24px 28px', background: 'rgba(255,255,255,0.55)', backdropFilter: 'blur(16px)', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.7)', boxShadow: '0 8px 32px rgba(31,38,135,0.06)', cursor: 'pointer', transition: 'transform 0.3s ease, box-shadow 0.3s ease' }}
                        onClick={() => setExpandedSection('overview')}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 20px 40px rgba(31,38,135,0.12)'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(31,38,135,0.06)'; }}
                    >
                        <h3 style={{ marginBottom: '1.2rem', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>
                            <span style={{ fontSize: '1.3rem' }}>📅</span> Weekly Nutrition Overview
                            <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: '#94a3b8', fontWeight: 500 }}>Click to expand →</span>
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px' }}>
                            {[
                                { label: 'Total Calories', value: weeklyData.reduce((a,c) => a+c.calories, 0).toLocaleString(), unit: 'kcal', color: '#3b82f6' },
                                { label: 'Avg Protein', value: weeklyData.length > 0 ? Math.round(weeklyData.reduce((a,c) => a+c.protein,0)/7) : 0, unit: 'g', color: '#10b981' },
                                { label: 'Avg Carbs', value: weeklyData.length > 0 ? Math.round(weeklyData.reduce((a,c) => a+c.carbs,0)/7) : 0, unit: 'g', color: '#8b5cf6' },
                                { label: 'Avg Fat', value: weeklyData.length > 0 ? Math.round(weeklyData.reduce((a,c) => a+c.fat,0)/7) : 0, unit: 'g', color: '#f59e0b' },
                                { label: 'Avg Sugar', value: weeklyData.length > 0 ? Math.round(weeklyData.reduce((a,c) => a+c.sugar,0)/7) : 0, unit: 'g', color: '#ef4444' },
                            ].map(stat => (
                                <div key={stat.label} style={{ background: 'rgba(255,255,255,0.7)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.9)' }}>
                                    <div style={{ color: '#64748b', fontSize: '0.8rem', fontWeight: 600, marginBottom: '6px' }}>{stat.label}</div>
                                    <div style={{ fontWeight: 800, color: stat.color, fontSize: '1.6rem', lineHeight: 1 }}>{stat.value} <span style={{ fontSize: '0.9rem', color: '#94a3b8', fontWeight: 500 }}>{stat.unit}</span></div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 2. WEIGHT IMPACT ANALYSIS - left column */}
                    <div
                        className="report-card"
                        style={{ padding: '24px 28px', background: 'rgba(255,255,255,0.55)', backdropFilter: 'blur(16px)', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.7)', boxShadow: '0 8px 32px rgba(31,38,135,0.06)', cursor: 'pointer', transition: 'transform 0.3s ease, box-shadow 0.3s ease', display: 'flex', flexDirection: 'column' }}
                        onClick={() => setExpandedSection('weight')}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 20px 40px rgba(31,38,135,0.12)'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(31,38,135,0.06)'; }}
                    >
                        <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>
                            <span style={{ fontSize: '1.3rem' }}>⚖️</span> Weight Impact Analysis
                            <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: '#94a3b8', fontWeight: 500 }}>Click to expand →</span>
                        </h3>
                        <div style={{
                            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 16px',
                            background: weightImpact.indicator === 'Surplus' ? 'rgba(254,242,242,0.8)' : weightImpact.indicator === 'Deficit' ? 'rgba(240,253,250,0.8)' : 'rgba(240,253,244,0.8)',
                            border: `1px solid ${weightImpact.indicator === 'Surplus' ? '#fecaca' : weightImpact.indicator === 'Deficit' ? '#ccfbf1' : '#bbf7d0'}`,
                            borderRadius: '16px', textAlign: 'center'
                        }}>
                            <div style={{ fontSize: '3rem', marginBottom: '8px' }}>{weightImpact.indicator === 'Surplus' ? '📈' : weightImpact.indicator === 'Deficit' ? '📉' : '⚖️'}</div>
                            <div style={{ fontWeight: 700, color: weightImpact.indicator === 'Surplus' ? '#b91c1c' : weightImpact.indicator === 'Deficit' ? '#0f766e' : '#15803d', fontSize: '1.2rem', marginBottom: '6px' }}>{weightImpact.label}</div>
                            <div style={{ fontWeight: 800, color: weightImpact.indicator === 'Surplus' ? '#ef4444' : weightImpact.indicator === 'Deficit' ? '#14b8a6' : '#22c55e', fontSize: '2.2rem' }}>
                                {weightImpact.surplusDeficit > 0 ? '+' : ''}{Math.round(weightImpact.surplusDeficit).toLocaleString()} <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>kcal/week</span>
                            </div>
                        </div>
                    </div>

                    {/* 3. FOOD IMPACT SUMMARY - right column */}
                    <div
                        className="report-card"
                        style={{ padding: '24px 28px', background: 'rgba(255,255,255,0.55)', backdropFilter: 'blur(16px)', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.7)', boxShadow: '0 8px 32px rgba(31,38,135,0.06)', cursor: 'pointer', transition: 'transform 0.3s ease, box-shadow 0.3s ease', display: 'flex', flexDirection: 'column' }}
                        onClick={() => setExpandedSection('impact')}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 20px 40px rgba(31,38,135,0.12)'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(31,38,135,0.06)'; }}
                    >
                        <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>
                            <span style={{ fontSize: '1.3rem' }}>🥗</span> Food Impact Summary
                            <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: '#94a3b8', fontWeight: 500 }}>Click to expand →</span>
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
                            {[
                                { icon: '🍏', label: 'Positive Impact', items: healthImpactLists.positive, bg: '#10b98115', color: '#10b981', border: 'rgba(16,185,129,0.2)' },
                                { icon: '⚠️', label: 'Negative Impact', items: healthImpactLists.negative, bg: '#ef444415', color: '#ef4444', border: 'rgba(239,68,68,0.2)' },
                                { icon: '⚪', label: 'Neutral', items: healthImpactLists.neutral, bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0' },
                            ].map(row => (
                                <div key={row.label} style={{ background: 'rgba(255,255,255,0.7)', padding: '12px 14px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.9)', flex: 1 }}>
                                    <div style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: 700, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ fontSize: '1rem' }}>{row.icon}</span>{row.label}</div>
                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                        {row.items.length > 0 ? row.items.slice(0, 4).map(food => (
                                            <span key={food} style={{ background: row.bg, color: row.color, padding: '4px 10px', borderRadius: '16px', fontSize: '0.82rem', fontWeight: 600, border: `1px solid ${row.border}` }}>{food}</span>
                                        )) : <span style={{ fontSize: '0.82rem', color: '#cbd5e1', fontStyle: 'italic' }}>None logged</span>}
                                        {row.items.length > 4 && <span style={{ fontSize: '0.82rem', color: '#94a3b8', fontStyle: 'italic' }}>+{row.items.length - 4} more</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 4. INTELLIGENT RECOMMENDATIONS - full width */}
                    <div
                        className="report-card"
                        style={{ gridColumn: '1 / -1', padding: '24px 28px', background: 'rgba(255,255,255,0.55)', backdropFilter: 'blur(16px)', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.7)', boxShadow: '0 8px 32px rgba(31,38,135,0.06)', cursor: 'pointer', transition: 'transform 0.3s ease, box-shadow 0.3s ease' }}
                        onClick={() => setExpandedSection('recs')}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 20px 40px rgba(31,38,135,0.12)'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(31,38,135,0.06)'; }}
                    >
                        <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>
                            <span style={{ fontSize: '1.3rem' }}>💡</span> Intelligent Recommendations
                            <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: '#94a3b8', fontWeight: 500 }}>Click to expand →</span>
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                            {recommendations.length > 0 ? recommendations.slice(0, 4).map((rec, idx) => (
                                <div key={idx} style={{
                                    display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '14px 16px', borderRadius: '16px',
                                    background: rec.type === 'warning' ? 'rgba(255,251,235,0.8)' : rec.type === 'info' ? 'rgba(239,246,255,0.8)' : 'rgba(240,253,244,0.8)',
                                    border: `1px solid ${rec.type === 'warning' ? '#fcd34d' : rec.type === 'info' ? '#bfdbfe' : '#bbf7d0'}`,
                                    borderLeft: `4px solid ${rec.type === 'warning' ? '#f59e0b' : rec.type === 'info' ? '#3b82f6' : '#22c55e'}`,
                                }}>
                                    <span style={{ fontSize: '1.3rem', lineHeight: 1, flexShrink: 0 }}>{rec.type === 'warning' ? '⚡' : rec.type === 'info' ? 'ℹ️' : '🌟'}</span>
                                    <span style={{ fontSize: '0.9rem', color: '#334155', fontWeight: 600, lineHeight: 1.5 }}>{rec.text}</span>
                                </div>
                            )) : (
                                <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', gridColumn: '1 / -1', fontStyle: 'italic' }}>Log more food this week for personalised recommendations</div>
                            )}
                        </div>
                    </div>

                    {/* 5. VISUAL ANALYTICS - full width, 2x2 chart grid */}
                    <div
                        className="report-card"
                        style={{ gridColumn: '1 / -1', padding: '24px 28px', background: 'rgba(255,255,255,0.55)', backdropFilter: 'blur(16px)', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.7)', boxShadow: '0 8px 32px rgba(31,38,135,0.06)', cursor: 'pointer', transition: 'transform 0.3s ease, box-shadow 0.3s ease' }}
                        onClick={() => setExpandedSection('analytics')}
                        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 20px 40px rgba(31,38,135,0.12)'; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(31,38,135,0.06)'; }}
                    >
                        <h3 style={{ marginBottom: '1.2rem', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>
                            <span style={{ fontSize: '1.3rem' }}>📊</span> Visual Analytics
                            <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: '#94a3b8', fontWeight: 500 }}>Click to expand →</span>
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            {/* Calorie Trend */}
                            <div style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.9)', padding: '18px', borderRadius: '18px' }}>
                                <h4 style={{ color: '#475569', fontSize: '0.88rem', marginBottom: '12px', textAlign: 'center', fontWeight: 700 }}>Weekly Calorie Trend</h4>
                                <div style={{ height: '200px' }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={weeklyData}>
                                            <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                                            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.95)' }} />
                                            <Line type="monotone" dataKey="calories" stroke="#3b82f6" strokeWidth={3} dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }} activeDot={{ r: 6, strokeWidth: 0, fill: '#3b82f6' }} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                            {/* Daily Calorie Intake */}
                            <div style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.9)', padding: '18px', borderRadius: '18px' }}>
                                <h4 style={{ color: '#475569', fontSize: '0.88rem', marginBottom: '12px', textAlign: 'center', fontWeight: 700 }}>Daily Calorie Intake</h4>
                                <div style={{ height: '200px' }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={weeklyData}>
                                            <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                                            <Tooltip 
                                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.95)' }} 
                                                cursor={{ fill: 'rgba(241,245,249,0.5)' }} 
                                                formatter={(val) => `${Math.round(val)} kcal`}
                                            />
                                            <Bar dataKey="calories" fill="#8b5cf6" radius={[6,6,0,0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                            {/* Macro Nutrient Distribution */}
                            <div style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.9)', padding: '18px', borderRadius: '18px' }}>
                                <h4 style={{ color: '#475569', fontSize: '0.88rem', marginBottom: '12px', textAlign: 'center', fontWeight: 700 }}>Macro Nutrient Distribution</h4>
                                <div style={{ height: '200px' }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={weeklyData}>
                                            <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                                            <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                                            <Tooltip 
                                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.95)' }} 
                                                cursor={{ fill: 'rgba(241,245,249,0.5)' }} 
                                                formatter={(val) => `${Number(val).toFixed(1)}g`}
                                            />
                                            <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                                            <Bar dataKey="protein" stackId="a" fill="#3b82f6" name="Protein (g)" />
                                            <Bar dataKey="carbs" stackId="a" fill="#10b981" name="Carbs (g)" />
                                            <Bar dataKey="fat" stackId="a" fill="#f59e0b" name="Fat (g)" />
                                            <Bar dataKey="sugar" stackId="a" fill="#ef4444" name="Sugar (g)" radius={[6,6,0,0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                            {/* Weekly Health Risk Impact */}
                            <div style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(255,255,255,0.9)', padding: '18px', borderRadius: '18px' }}>
                                <h4 style={{ color: '#475569', fontSize: '0.88rem', marginBottom: '12px', textAlign: 'center', fontWeight: 700 }}>Weekly Health Risk Impact</h4>
                                <div style={{ height: '200px', display: 'flex', justifyContent: 'center' }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={[
                                                    { name: 'Positive', value: Math.max(healthImpactLists.positive.length, 0.01) },
                                                    { name: 'Neutral', value: Math.max(healthImpactLists.neutral.length, 0.01) },
                                                    { name: 'Negative', value: Math.max(healthImpactLists.negative.length, 0.01) },
                                                ]}
                                                cx="50%" cy="45%"
                                                innerRadius={55} outerRadius={80}
                                                paddingAngle={4} dataKey="value" stroke="none" cornerRadius={5}
                                            >
                                                <Cell fill="#10b981" />
                                                <Cell fill="#cbd5e1" />
                                                <Cell fill="#ef4444" />
                                            </Pie>
                                            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.95)' }} formatter={(value, name) => [name === 'Positive' || name === 'Neutral' || name === 'Negative' ? `${Math.round(value)} items` : value, name]} />
                                            <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '6px' }} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* MODAL DIALOG PORTAL - For expanded sections */}
                {expandedSection && (
                    <div 
                        style={{
                            position: 'fixed', inset: 0, zIndex: 9999,
                            background: 'rgba(15, 23, 42, 0.4)',
                            backdropFilter: 'blur(16px)',
                            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
                            padding: '40px 24px', overflowY: 'auto'
                        }}
                        onClick={() => setExpandedSection(null)}
                    >
                        <div 
                            style={{
                                background: 'rgba(255, 255, 255, 0.95)',
                                borderRadius: '32px',
                                padding: '40px',
                                maxWidth: expandedSection === 'analytics' ? '1200px' : '900px',
                                width: '100%',
                                margin: 'auto',
                                boxSizing: 'border-box',
                                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)',
                                position: 'relative',
                                animation: 'modalScaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
                            }}
                            onClick={e => e.stopPropagation()}
                        >
                            <button 
                                onClick={() => setExpandedSection(null)}
                                style={{
                                    position: 'absolute', top: '24px', right: '24px',
                                    background: 'rgba(241, 245, 249, 0.8)', border: 'none',
                                    width: '40px', height: '40px', borderRadius: '50%',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    cursor: 'pointer', fontSize: '20px', color: '#475569',
                                    transition: 'background 0.2s'
                                }}
                                onMouseOver={e => e.currentTarget.style.background = '#e2e8f0'}
                                onMouseOut={e => e.currentTarget.style.background = 'rgba(241, 245, 249, 0.8)'}
                            >×</button>

                            {/* MODAL CONTENT BASED ON SELECTION */}
                            {expandedSection === 'overview' && (
                                <div>
                                    <h2 style={{ marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '2rem', color: '#1e293b' }}>
                                        {Icons.overview} Weekly Nutrition Overview
                                    </h2>
                                    {/* Copy of Overview content adapted for modal */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '24px' }}>
                                        <div style={{ background: '#f8fafc', padding: '32px', borderRadius: '24px' }}>
                                            <div style={{ color: '#64748b', fontSize: '1.2rem', marginBottom: '12px' }}>Total Calories</div>
                                            <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '2.5rem' }}>{weeklyData.reduce((acc, curr) => acc + curr.calories, 0).toLocaleString()} <span style={{fontSize: '1.2rem'}}>kcal</span></div>
                                        </div>
                                        <div style={{ background: '#f8fafc', padding: '32px', borderRadius: '24px' }}>
                                            <div style={{ color: '#64748b', fontSize: '1.2rem', marginBottom: '12px' }}>Avg Protein</div>
                                            <div style={{ fontWeight: 800, color: '#10b981', fontSize: '2.5rem' }}>{weeklyData.length > 0 ? Math.round(weeklyData.reduce((acc, curr) => acc + curr.protein, 0) / 7) : 0} <span style={{fontSize: '1.2rem'}}>g</span></div>
                                        </div>
                                        <div style={{ background: '#f8fafc', padding: '32px', borderRadius: '24px' }}>
                                            <div style={{ color: '#64748b', fontSize: '1.2rem', marginBottom: '12px' }}>Avg Carbs</div>
                                            <div style={{ fontWeight: 800, color: '#3b82f6', fontSize: '2.5rem' }}>{weeklyData.length > 0 ? Math.round(weeklyData.reduce((acc, curr) => acc + curr.carbs, 0) / 7) : 0} <span style={{fontSize: '1.2rem'}}>g</span></div>
                                        </div>
                                        <div style={{ background: '#f8fafc', padding: '32px', borderRadius: '24px' }}>
                                            <div style={{ color: '#64748b', fontSize: '1.2rem', marginBottom: '12px' }}>Avg Fat</div>
                                            <div style={{ fontWeight: 800, color: '#f59e0b', fontSize: '2.5rem' }}>{weeklyData.length > 0 ? Math.round(weeklyData.reduce((acc, curr) => acc + curr.fat, 0) / 7) : 0} <span style={{fontSize: '1.2rem'}}>g</span></div>
                                        </div>
                                        <div style={{ background: '#f8fafc', padding: '32px', borderRadius: '24px' }}>
                                            <div style={{ color: '#64748b', fontSize: '1.2rem', marginBottom: '12px' }}>Avg Sugar</div>
                                            <div style={{ fontWeight: 800, color: '#ef4444', fontSize: '2.5rem' }}>{weeklyData.length > 0 ? Math.round(weeklyData.reduce((acc, curr) => acc + curr.sugar, 0) / 7) : 0} <span style={{fontSize: '1.2rem'}}>g</span></div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {expandedSection === 'weight' && (
                                <div>
                                    <h2 style={{ marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '2rem', color: '#1e293b' }}>
                                        {Icons.weight} Weight Impact Analysis
                                    </h2>
                                    <div style={{ padding: '64px', background: weightImpact.indicator === 'Surplus' ? '#fef2f2' : weightImpact.indicator === 'Deficit' ? '#f0fdfa' : '#f0fdf4', borderRadius: '32px', textAlign: 'center' }}>
                                        <div style={{ fontSize: '6rem', marginBottom: '24px' }}>{weightImpact.indicator === 'Surplus' ? '📈' : weightImpact.indicator === 'Deficit' ? '📉' : '⚖️'}</div>
                                        <div style={{ fontWeight: 800, color: weightImpact.indicator === 'Surplus' ? '#991b1b' : weightImpact.indicator === 'Deficit' ? '#0f766e' : '#166534', fontSize: '3rem', marginBottom: '24px' }}>
                                            {weightImpact.label}
                                        </div>
                                        <div style={{ fontWeight: 800, color: weightImpact.indicator === 'Surplus' ? '#ef4444' : weightImpact.indicator === 'Deficit' ? '#14b8a6' : '#22c55e', fontSize: '5rem' }}>
                                            {weightImpact.surplusDeficit > 0 ? '+' : ''}{Math.round(weightImpact.surplusDeficit).toLocaleString()} <span style={{ fontSize: '2rem' }}>kcal</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {expandedSection === 'impact' && (
                                <div>
                                    <h2 style={{ marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '2rem', color: '#1e293b' }}>
                                        {Icons.impact} Food Impact Summary
                                    </h2>
                                    <div style={{ display: 'grid', gap: '32px' }}>
                                        <div style={{ background: '#f8fafc', padding: '32px', borderRadius: '24px' }}>
                                            <h4 style={{ fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '12px', color: '#10b981', marginBottom: '24px' }}><span>🍏</span> Positive Impact Foods</h4>
                                            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                                                {healthImpactLists.positive.length > 0 ? healthImpactLists.positive.map(food => (
                                                    <span key={`mdl-pos-${food}`} style={{ background: '#d1fae5', color: '#065f46', padding: '12px 24px', borderRadius: '100px', fontSize: '1.1rem', fontWeight: 600 }}>{food}</span>
                                                )) : <span style={{ color: '#94a3b8' }}>None logged</span>}
                                            </div>
                                        </div>
                                        <div style={{ background: '#f8fafc', padding: '32px', borderRadius: '24px' }}>
                                            <h4 style={{ fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '12px', color: '#ef4444', marginBottom: '24px' }}><span>⚠️</span> Negative Impact Foods</h4>
                                            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                                                {healthImpactLists.negative.length > 0 ? healthImpactLists.negative.map(food => (
                                                    <span key={`mdl-neg-${food}`} style={{ background: '#fee2e2', color: '#991b1b', padding: '12px 24px', borderRadius: '100px', fontSize: '1.1rem', fontWeight: 600 }}>{food}</span>
                                                )) : <span style={{ color: '#94a3b8' }}>None logged</span>}
                                            </div>
                                        </div>
                                        <div style={{ background: '#f8fafc', padding: '32px', borderRadius: '24px' }}>
                                            <h4 style={{ fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '12px', color: '#64748b', marginBottom: '24px' }}><span>⚪</span> Neutral Foods</h4>
                                            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                                                {healthImpactLists.neutral.length > 0 ? healthImpactLists.neutral.map(food => (
                                                    <span key={`mdl-neu-${food}`} style={{ background: '#e2e8f0', color: '#334155', padding: '12px 24px', borderRadius: '100px', fontSize: '1.1rem', fontWeight: 600 }}>{food}</span>
                                                )) : <span style={{ color: '#94a3b8' }}>None logged</span>}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {expandedSection === 'recs' && (
                                <div>
                                    <h2 style={{ marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '2rem', color: '#1e293b' }}>
                                        {Icons.recs} Recommendations
                                    </h2>
                                    <div style={{ display: 'grid', gap: '24px' }}>
                                        {recommendations.length > 0 ? recommendations.map((rec, idx) => (
                                            <div key={`mdl-rec-${idx}`} style={{ padding: '32px', background: rec.type === 'warning' ? '#fffbeb' : rec.type === 'info' ? '#eff6ff' : '#f0fdf4', borderRadius: '24px', display: 'flex', gap: '24px', alignItems: 'center' }}>
                                                <div style={{ fontSize: '3rem' }}>{rec.type === 'warning' ? '⚡' : rec.type === 'info' ? 'ℹ️' : '🌟'}</div>
                                                <div style={{ fontSize: '1.4rem', color: '#1e293b', fontWeight: 600, lineHeight: 1.5 }}>{rec.text}</div>
                                            </div>
                                        )) : <div style={{ padding: '48px', textAlign: 'center', background: '#f8fafc', borderRadius: '24px', fontSize: '1.4rem', color: '#64748b' }}>No recommendations yet. Log more foods.</div>}
                                    </div>
                                </div>
                            )}

                            {expandedSection === 'analytics' && (
                                <div style={{ minHeight: '600px' }}>
                                    <h2 style={{ marginBottom: '32px', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '2rem', color: '#1e293b' }}>
                                        {Icons.analytics} Visual Analytics
                                    </h2>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px' }}>
                                        {/* Copied charts with larger dimensions */}
                                        <div style={{ background: '#f8fafc', padding: '32px', borderRadius: '24px' }}>
                                            <h4 style={{ color: '#475569', fontSize: '1.4rem', marginBottom: '32px', textAlign: 'center', fontWeight: 700 }}>Weekly Calorie Trend</h4>
                                            <div style={{ height: '400px' }}>
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <LineChart data={weeklyData}>
                                                        <XAxis dataKey="name" stroke="#94a3b8" fontSize={14} tickLine={false} axisLine={false} />
                                                        <Tooltip 
                                                            contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', background: '#fff' }} 
                                                            formatter={(val) => `${Math.round(val)} kcal`}
                                                        />
                                                        <Line type="monotone" dataKey="calories" stroke="#3b82f6" strokeWidth={5} dot={{ fill: '#3b82f6', strokeWidth: 3, r: 6 }} activeDot={{ r: 9, strokeWidth: 0, fill: '#3b82f6' }} />
                                                    </LineChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>

                                        <div style={{ background: '#f8fafc', padding: '32px', borderRadius: '24px' }}>
                                            <h4 style={{ color: '#475569', fontSize: '1.4rem', marginBottom: '32px', textAlign: 'center', fontWeight: 700 }}>Macro Distribution</h4>
                                            <div style={{ height: '400px' }}>
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <BarChart data={weeklyData}>
                                                        <XAxis dataKey="name" stroke="#94a3b8" fontSize={14} tickLine={false} axisLine={false} />
                                                        <Tooltip 
                                                            contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)', background: '#fff' }} 
                                                            cursor={{ fill: 'rgba(241, 245, 249, 0.8)' }} 
                                                            formatter={(val) => `${Number(val).toFixed(1)}g`}
                                                        />
                                                        <Legend wrapperStyle={{ fontSize: '16px', paddingTop: '16px' }} />
                                                        <Bar dataKey="protein" stackId="a" fill="#3b82f6" name="Protein" />
                                                        <Bar dataKey="carbs" stackId="a" fill="#10b981" name="Carbs" />
                                                        <Bar dataKey="fat" stackId="a" fill="#f59e0b" name="Fat" />
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
            
            <style jsx>{`
                .card-hover-expand:hover {
                    transform: translateY(-5px) scale(1.01);
                    box-shadow: 0 20px 40px -10px rgba(0,0,0,0.1) !important;
                    border-color: rgba(255,255,255,0.9) !important;
                }
                .expand-hint {
                    position: absolute;
                    bottom: 12px;
                    right: 24px;
                    font-size: 0.85rem;
                    color: #64748b;
                    font-weight: 600;
                    opacity: 0;
                    transform: translateY(10px);
                    transition: all 0.3s;
                    background: rgba(255,255,255,0.8);
                    padding: 4px 12px;
                    border-radius: 20px;
                    backdrop-filter: blur(4px);
                }
                .card-hover-expand:hover .expand-hint {
                    opacity: 1;
                    transform: translateY(0);
                }
                @keyframes modalScaleIn {
                    from { transform: scale(0.95); opacity: 0; }
                    to { transform: scale(1); opacity: 1; }
                }
            `}</style>
        </div>
    );
}
