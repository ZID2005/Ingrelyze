import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { doc, getDoc, collection, addDoc, query, where, getDocs, orderBy, limit, Timestamp, onSnapshot, serverTimestamp } from "firebase/firestore";
import axios from "axios";
import { LineChart, Line, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import GlassIcons from "../components/GlassIcons";
import { ChatBubble, ChatBubbleMessage, ChatBubbleAvatar } from "../components/ChatBubble";
import { GlassButton } from "../components/GlassButton";
import { FlowButton } from "../components/FlowButton";
import { motion, AnimatePresence } from "motion/react";
import GreetingText from '../components/GreetingText';
import { ButtonSpinner, RoundSpinner, LoadingDots } from '../components/Spinner';
import API from "../utils/api";
import "../components/DashboardLayout.css";

export function getGradeInfo(numScore) {
    const s = Number(numScore);
    if (s === 0) return { grade: 'A+', bg: '#10b981', text: '#059669', level: 0, feedback: 'Optimal dietary alignment.' };
    if (s === 1) return { grade: 'A', bg: '#10b981', text: '#059669', level: 1, feedback: 'Excellent dietary alignment.' };
    if (s === 2) return { grade: 'B', bg: '#f59e0b', text: '#d97706', level: 2, feedback: 'Good choice, balanced intake.' };
    if (s === 3) return { grade: 'C', bg: '#f97316', text: '#ea580c', level: 3, feedback: 'Consume in moderation.' };
    if (s >= 4) return { grade: 'D', bg: '#ef4444', text: '#dc2626', level: 4, feedback: 'Potential health risk.' };
    return { grade: '-', bg: '#94a3b8', text: '#64748b', level: -1, feedback: 'Analysis unavailable.' };
}

export default function Dashboard() {
    const { currentUser } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [userPrefs, setUserPrefs] = useState(null);
    // State Separation: Latest vs History
    // Latest Analysis State
    const [latestResult, setLatestResult] = useState(null);
    const [latestNutrients, setLatestNutrients] = useState(null);
    const [latestFoodName, setLatestFoodName] = useState('');
    const [latestQuantity, setLatestQuantity] = useState(1); // Locked in after analysis
    const [ringOffset, setRingOffset] = useState(2 * Math.PI * 62);

    // Search & UI State
    const [searchTerm, setSearchTerm] = useState("");
    const [quantity, setQuantity] = useState(1);
    const [searchResults, setSearchResults] = useState([]);
    const [error, setError] = useState("");
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [aiQuery, setAiQuery] = useState("");
    const [chatMessages, setChatMessages] = useState([]); // Array of { text, sender: 'user' | 'ai' }
    const [isAiLoading, setIsAiLoading] = useState(false);
    const chatEndRef = React.useRef(null);

    useEffect(() => {
        if (!currentUser) return;
        const ref = doc(db, "users", currentUser.uid);
        const unsubscribe = onSnapshot(ref, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setUserPrefs(data);
                // If there's a daily tracker, use it
                if (data.dailyTracker) {
                    setDailyTotals(data.dailyTracker);
                }
            }
        }, (err) => {
            console.error("Error syncing user profile:", err);
        });

        return () => unsubscribe();
    }, [currentUser, db]);

    // Auto-scroll chat to bottom
    useEffect(() => {
        if (chatEndRef.current) {
            chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [chatMessages, isAiLoading]);

    // Daily Tracking State (Strictly isolated per-user via Firestore)
    const [allEntries, setAllEntries] = useState([]); // All historical entries
    const [dailyEntries, setDailyEntries] = useState([]); // Today only
    const [recentlyAnalyzed, setRecentlyAnalyzed] = useState([]); // Last 5
    const [dailyTotals, setDailyTotals] = useState({ calories: 0, protein: 0, carbs: 0, fat: 0, sugar: 0 });
    const [weeklyData, setWeeklyData] = useState([]); // Chart data
    const [weeklyEntries, setWeeklyEntries] = useState([]); // Past 7 days objects

    // Real-time Clock State
    const [currentTime, setCurrentTime] = useState(new Date());

    const firstName = useMemo(() => {
        // Prefer Firestore name, then Firebase Auth name, then fallback
        const nameSource = userPrefs?.name || currentUser?.displayName || "";
        const parts = nameSource.trim().split(/\s+/);
        return parts[0] || "User";
    }, [userPrefs, currentUser]);

    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentTime(new Date());
        }, 10000); // Update every 10 seconds for smoothness
        return () => clearInterval(timer);
    }, []);

    const greeting = useMemo(() => {
        const hour = currentTime.getHours();
        if (hour < 12) return "Morning";
        if (hour < 18) return "Afternoon";
        return "Evening";
    }, [currentTime]);

    const formattedTime = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const formattedDate = currentTime.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    // Health improvement logic
    const healthStats = useMemo(() => {
        if (!allEntries || allEntries.length === 0) return { improvement: 0, status: 'starting' };

        const now = new Date();
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

        const formatDate = (d) => d.toISOString().split('T')[0];
        const thisWeekStr = formatDate(oneWeekAgo);
        const lastWeekStr = formatDate(twoWeeksAgo);

        const thisWeekEntries = allEntries.filter(e => e.date >= thisWeekStr);
        const lastWeekEntries = allEntries.filter(e => e.date >= lastWeekStr && e.date < thisWeekStr);

        if (thisWeekEntries.length === 0) return { improvement: 0, status: 'no_data' };

        const getAvgScore = (entries) => {
            if (entries.length === 0) return null;
            const sum = entries.reduce((acc, e) => {
                const score = e.healthLevel !== undefined ? e.healthLevel : (e.analysis?.health_level || 0);
                return acc + (100 - (score * 25)); // Map 0-4 to 100-0
            }, 0);
            return sum / entries.length;
        };

        const currentAvg = getAvgScore(thisWeekEntries);
        const lastAvg = getAvgScore(lastWeekEntries);

        if (lastAvg === null || lastAvg === 0) {
            // First week or no baseline - return a neutral state
            return { improvement: 0, status: 'first_week' };
        }

        const improvement = Math.round(((currentAvg - lastAvg) / lastAvg) * 100);
        return {
            improvement: Math.abs(improvement),
            status: improvement >= 0 ? 'positive' : 'negative'
        };
    }, [allEntries]);

    async function handleAiSubmit(e) {
        if (e.key && e.key !== 'Enter') return;
        const queryText = aiQuery.trim();
        if (!queryText || !currentUser) return;

        // 1. Add User Message immediately
        setChatMessages(prev => [...prev, { text: queryText, sender: 'user' }]);
        setAiQuery("");
        setIsAiLoading(true);

        try {
            const token = await currentUser.getIdToken();
            const todayStr = new Date().toLocaleDateString('en-CA');

            const reqUrl = `${API}/ai-assistant`;
            const response = await axios.post(
                reqUrl,
                {
                    query: queryText,
                    local_date: todayStr,
                    user_name: currentUser.displayName || (currentUser.email ? currentUser.email.split('@')[0] : "User"),
                    user_preferences: userPrefs,
                    daily_totals: dailyTotals,
                    weekly_data: weeklyData,
                    recent_foods: dailyEntries,
                    weekly_foods: weeklyEntries
                },
                {
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`
                    }
                }
            );

            if (response.data && response.data.success) {
                let cleanText = response.data.analysis.replace(/\*\*/g, '');
                
                // Final Safety Layer: Remove any remaining JSON block that might have slipped through
                const jsonPattern = /{[\s\n]*"detected_foods"[\s\S]*?}/g;
                cleanText = cleanText.replace(jsonPattern, '').trim();

                setChatMessages(prev => [...prev, { text: cleanText, sender: 'ai' }]);

                // 2. Persist any detected foods to Firestore
                if (response.data.detected_foods && response.data.detected_foods.length > 0) {
                    const todayStr = new Date().toLocaleDateString('en-CA');

                    response.data.detected_foods.forEach(food => {
                        const dbEntry = {
                            userId: currentUser.uid,
                            foodName: food.name,
                            quantity: 1, // Default for AI detected items
                            calories: food.calories || 0,
                            protein: food.protein || 0,
                            carbs: food.carbs || 0,
                            fat: food.fat || 0,
                            sugar: food.sugar || 0,
                            sodium: food.sodium || 0,
                            date: todayStr,
                            healthLevel: 0, // Placeholder for chat-logged items
                            analysis: { explanation: "Logged via AI Assistant" },
                            createdAt: serverTimestamp()
                        };

                        addDoc(collection(db, "foodEntries"), dbEntry).catch(err =>
                            console.error("AI Logging Error:", err)
                        );
                    });
                }
            } else {
                const errorMsg = response.data?.analysis || "Sorry, I couldn't process that right now.";
                setChatMessages(prev => [...prev, { text: errorMsg, sender: 'ai' }]);
            }
        } catch (err) {
            console.error("AI Assistant Error:", err);
            setChatMessages(prev => [...prev, { text: "Failed to connect to the assistant. Check your connection.", sender: 'ai' }]);
        } finally {
            setIsAiLoading(false);
        }
    }

    // Centralized Data Processor: Derives all derived states from allEntries
    useEffect(() => {
        if (!allEntries || allEntries.length === 0) {
            setDailyEntries([]);
            setDailyTotals({ calories: 0, protein: 0, carbs: 0, fat: 0, sugar: 0 });
            setWeeklyEntries([]);
            setWeeklyData([]);
            setRecentlyAnalyzed([]);
            return;
        }

        const todayStr = new Date().toLocaleDateString('en-CA');

        // 1. Get Today's Entries & Totals
        const todayItems = allEntries.filter(e => e.date === todayStr);
        let tTotals = { calories: 0, protein: 0, carbs: 0, fat: 0, sugar: 0 };
        todayItems.forEach(d => {
            tTotals.calories += Number(d.calories || 0);
            tTotals.protein += Number(d.protein || 0);
            tTotals.carbs += Number(d.carbs || 0);
            tTotals.fat += Number(d.fat || 0);
            tTotals.sugar += Number(d.sugar || 0);
        });
        Object.keys(tTotals).forEach(k => tTotals[k] = Math.round(tTotals[k] * 10) / 10);

        setDailyEntries(todayItems);
        setDailyTotals(tTotals);

        // 2. Get Weekly Entries & Chart Data
        const dates = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            dates.push(d.toLocaleDateString('en-CA'));
        }

        const dailyMap = {};
        dates.forEach(d => dailyMap[d] = { calories: 0, protein: 0, carbs: 0, fat: 0, sugar: 0, sodium: 0 });

        const weekItems = allEntries.filter(e => e.date >= dates[0] && e.date <= dates[6]);
        weekItems.forEach(data => {
            if (dailyMap[data.date]) {
                dailyMap[data.date].calories += Number(data.calories || 0);
                dailyMap[data.date].protein += Number(data.protein || 0);
                dailyMap[data.date].carbs += Number(data.carbs || 0);
                dailyMap[data.date].fat += Number(data.fat || 0);
                dailyMap[data.date].sugar += Number(data.sugar || 0);
                dailyMap[data.date].sodium += Number(data.sodium || 0);
            }
        });

        const formattedWeekly = dates.map(d => {
            const dateObj = new Date(d);
            return {
                name: dateObj.toLocaleDateString('en-US', { weekday: 'short' }),
                calories: Math.round(dailyMap[d].calories),
                protein: Math.round(dailyMap[d].protein),
                carbs: Math.round(dailyMap[d].carbs),
                fat: Math.round(dailyMap[d].fat),
                sugar: Math.round(dailyMap[d].sugar),
                sodium: Math.round(dailyMap[d].sodium)
            };
        });

        setWeeklyEntries(weekItems);
        setWeeklyData(formattedWeekly);

        // 3. Recently Analyzed (Top 5)
        const top5 = allEntries.slice(0, 5).map(item => {
            const numScore = item.healthLevel !== undefined ? item.healthLevel : (item.analysis?.health_level || 0);
            return {
                id: item.id || Math.random().toString(),
                name: item.foodName || "Unknown",
                quantity: item.quantity || 1,
                gradeInfo: getGradeInfo(numScore),
                date: item.date || new Date().toLocaleDateString('en-CA'),
                analysisResult: item.analysis || { health_level: numScore },
                nutrients: item.fullNutrients || { calories: item.calories || 0 }
            };
        });
        setRecentlyAnalyzed(top5);

    }, [allEntries]);

    useEffect(() => {
        if (!currentUser) return;

        // Standard non-realtime initial load placeholders if needed, 
        // but onSnapshot will handle it.
    }, [currentUser]);

    // Load user prefs
    useEffect(() => {
        async function loadUserPrefs() {
            if (!currentUser) return;
            try {
                const ref = doc(db, "users", currentUser.uid);
                const snap = await getDoc(ref);
                if (snap.exists()) setUserPrefs(snap.data());
            } catch (err) {
                console.error("Failed to load user preferences.");
            }
        }
        loadUserPrefs();
    }, [currentUser]);

    // Handle SVG Progress Ring Animation Updates
    useEffect(() => {
        const C = 2 * Math.PI * 62;
        if (!latestResult) {
            setRingOffset(C); // Reset to empty
            return;
        }

        // Ensure accurate scaling: Score 0 (A+) = 100% full, Score 4 (D) = 20% full
        const score = latestResult.health_level >= 0 ? latestResult.health_level : 4;
        const fillPercentage = 1 - (Math.min(score, 4) / 5);
        const targetOffset = C - (C * fillPercentage);

        // Slight delay forces browser to apply transition from old/empty to new
        const timer = setTimeout(() => setRingOffset(targetOffset), 50);
        return () => clearTimeout(timer);
    }, [latestResult]);

    // Load Daily Entries (Strictly isolated per-user from Firestore)
    useEffect(() => {
        // Always reset state when user changes (login, logout, or switch)
        setDailyEntries([]);
        setLatestResult(null);
        setLatestNutrients(null);

        if (!currentUser) {
            return;
        }

        const q = query(
            collection(db, "foodEntries"),
            where("userId", "==", currentUser.uid)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const entries = [];
            snapshot.forEach((doc) => {
                entries.push({ id: doc.id, ...doc.data() });
            });

            // Sort descending by time
            entries.sort((a, b) => {
                const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
                const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
                return timeB - timeA;
            });

            setAllEntries(entries);
        }, (err) => {
            console.error("Failed to load user-isolated data:", err);
        });

        return () => unsubscribe();
    }, [currentUser]);

    // Auto-load most recent logic moved here:
    useEffect(() => {
        if (recentlyAnalyzed.length > 0 && !latestResult) {
            const mostRecent = recentlyAnalyzed[0];
            // Ensure it has data structure
            if (mostRecent.analysisResult && mostRecent.nutrients) {
                setLatestResult(mostRecent.analysisResult);
                setLatestNutrients(mostRecent.nutrients);
                setLatestFoodName(mostRecent.name || '');
            }
        }
    }, [recentlyAnalyzed, latestResult]);

    // Input handlers
    function handleChange(e) {
        // No special mode switching needed anymore
    }

    async function handleSearch(e) {
        const term = e.target.value;
        setSearchTerm(term);

        // 1. Try NLP Parse
        // [REMOVED] Realtime parsing - now happens on Analyze click
        // const nlpResult = parseFoodInput(term);
        // ...

        if (term.length < 2) {
            setSearchResults([]);
            return;
        }

        // Only search backend if it looks like a single item query or user forces it.
        // For now, we continue searching whatever they type to be safe.
        // But if NLP detected '2 pizzas', we search for 'pizza' for the autosuggest? 
        // Let's search for the *last* detected item's food name if NLP active, else raw term.

        let queryTerm = term;
        // The original code had nlpResult here, but it was commented out.
        // Assuming nlpResult is not available here as per the comment.
        // If it were, it would be:
        // if (nlpResult.length > 0) {
        //     queryTerm = nlpResult[0].food; // Naive: search for first parsed item
        // }

        try {
            const token = currentUser ? await currentUser.getIdToken() : null;
            const res = await axios.get(`${API}/search?query=${encodeURIComponent(queryTerm)}`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            });
            setSearchResults(res.data);
        } catch (err) {
            console.error("Search failed");
        }
    }

    // [REMOVED] Smart Search Effect - now called explicitly
    // useEffect(() => { ... }, [parsedItems]);

    function handleSelectFood(item) {
        setSearchTerm(item.food);
        setSearchResults([]);
    }

    // Analyze
    async function handleAnalyze(e) {
        e.preventDefault();
        if (!searchTerm) return;
        setLoading(true);
        setError("");

        console.log("--- Starting Analyze ---");
        const t0 = performance.now();

        // Prevent stale data from showing during a new query
        setLatestResult(null);
        setLatestNutrients(null);

        try {
            const payload = {
                query: searchTerm,
                quantity: quantity,
                user_preferences: userPrefs ? {
                    diabetes_level: userPrefs.diabetes,
                    hypertension_level: userPrefs.hypertension,
                    cholesterol_level: userPrefs.cholesterol,
                    lactose_level: userPrefs.lactose,
                    weight_goal: userPrefs.weightGoal,
                    height_cm: parseFloat(userPrefs.height) || 0,
                    weight_kg: parseFloat(userPrefs.weight) || 0
                } : null
            };

            const t1 = performance.now();
            console.log("1. Prep done:", t1 - t0, "ms");

            const token = currentUser ? await currentUser.getIdToken() : null;
            const t2 = performance.now();
            console.log("2. Token fetch done:", t2 - t1, "ms");

            const res = await axios.post(`${API}/analyze`, payload, {
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            });
            const t3 = performance.now();
            console.log("3. API Axios fetch done:", t3 - t2, "ms");

            if (res.data.success) {
                const submittedQty = quantity; // Capture before state reset
                setLatestNutrients(res.data.analysis);
                setLatestResult(res.data.rating);
                setLatestFoodName(res.data.savedEntry?.foodName || searchTerm);
                setLatestQuantity(submittedQty); // Lock in the analyzed quantity
                setSearchTerm(""); // Clear input on success
                setQuantity(1); // Reset quantity on success

                const t4 = performance.now();
                console.log("4. React states set:", t4 - t3, "ms");

                // Determine Label Score
                const numScore = res.data.rating.health_level;

                // Parse the backend's savedEntry structure
                if (res.data.savedEntry) {
                    const entry = res.data.savedEntry;

                    // 1. Save entry explicitly from Authenticated Frontend SDK (Fire and Forget)
                    const dbEntry = {
                        userId: currentUser.uid,
                        foodName: entry.foodName,
                        quantity: submittedQty,
                        calories: entry.calories,
                        protein: entry.protein,
                        carbs: entry.carbs,
                        fat: entry.fat,
                        sugar: entry.sugar,
                        sodium: entry.sodium || 0,
                        date: new Date().toLocaleDateString('en-CA'), // Strictly local YYYY-MM-DD
                        healthLevel: numScore,
                        analysis: res.data.rating,
                        fullNutrients: res.data.analysis,
                        createdAt: serverTimestamp() // Better than local Timestamp.now()
                    };

                    addDoc(collection(db, "foodEntries"), dbEntry).catch(dbErr => {
                        console.error("Failed to save entry to Firestore:", dbErr);
                    });
                }
            } else {
                setError(res.data.message || "Food not found");
            }

        } catch (err) {
            console.error(err);
            setError(err.response?.data?.detail || err.response?.data?.message || err.message || "Failed to analyze food. Server error.");
        } finally {
            setLoading(false);
            console.log("5. Finally block reached:", performance.now() - t0, "ms");
        }
    }

    // [REMOVED] Unused addToRecent helper

    function handleSelectRecent(item) {
        if (!item) return;
        setSearchTerm(item.name);
        setQuantity(item.quantity || 1);

        // Load stored values into main display state synchronously
        setLatestResult(item.analysisResult);
        setLatestNutrients(item.nutrients);

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Derived State for Display
    const showSearch = searchTerm.length > 0;
    const isShowingResult = latestResult && latestNutrients;

    // Weekly Health Impact Calculation
    const healthImpactLists = useMemo(() => {
        const positive = new Set();
        const negative = new Set();
        const neutral = new Set();

        if (weeklyEntries.length === 0) {
            return { positive: [], negative: [], neutral: [] };
        }

        weeklyEntries.forEach(entry => {
            if (!entry || !entry.foodName) return;
            const name = entry.foodName;

            // Use the backend-provided healthLevel if available (already accounts for user risk)
            if (entry.healthLevel !== undefined && entry.healthLevel !== null) {
                const level = Number(entry.healthLevel);
                if (level <= 1) positive.add(name);
                else if (level >= 3) negative.add(name);
                else neutral.add(name);
            } else {
                // Heuristic Fallback for historical data (missing healthLevel)
                const sugarRaw = entry.sugar || entry.fullNutrients?.sugar;
                const sodiumRaw = entry.sodium || entry.fullNutrients?.sodium;
                const fatRaw = entry.fat || entry.fullNutrients?.fat;

                const sugar = Number(sugarRaw || 0);
                const sodium = Number(sodiumRaw || 0);
                const fat = Number(fatRaw || 0);

                const hasDiabetes = userPrefs?.diabetes === "High" || userPrefs?.diabetes === "Medium";
                const hasHypertension = userPrefs?.hypertension === "High" || userPrefs?.hypertension === "Medium";
                const hasCholesterol = userPrefs?.cholesterol === "High" || userPrefs?.cholesterol === "Medium";

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

                if (isNeg) negative.add(name);
                else if (isPos) positive.add(name);
                else neutral.add(name);
            }
        });

        return {
            positive: Array.from(positive),
            negative: Array.from(negative),
            neutral: Array.from(neutral)
        };
    }, [weeklyEntries]);

    // Weight Impact & Intelligent Recommendations Evaluation
    const { weightImpact, recommendations } = useMemo(() => {
        let recs = [];
        let wImpact = {
            surplusDeficit: 0,
            indicator: 'Balanced', // Balanced, Surplus, Deficit
            label: 'Balanced Calorie Intake'
        };

        if (weeklyEntries.length === 0 || weeklyData.length === 0) {
            return { weightImpact: wImpact, recommendations: recs };
        }

        // --- Weight Impact ---
        const totalCalories = weeklyData.reduce((acc, curr) => acc + curr.calories, 0);

        // Count how many literal days have > 0 calories tracked to get a true daily baseline average
        const loggedDays = weeklyData.filter(d => d.calories > 0).length || 1;

        const avgDailyRecommended = 2000; // Standard baseline
        const expectedCalories = loggedDays * avgDailyRecommended;
        const calorieDiff = totalCalories - expectedCalories;

        wImpact.surplusDeficit = calorieDiff;

        if (calorieDiff > 500) {
            wImpact.indicator = 'Surplus';
            wImpact.label = 'Calorie Surplus - Weight Gain Risk';
        } else if (calorieDiff < -500) {
            wImpact.indicator = 'Deficit';
            wImpact.label = 'Calorie Deficit - Weight Loss Trend';
        }

        // --- Intelligent Recommendations ---
        const totalProtein = weeklyData.reduce((acc, curr) => acc + curr.protein, 0);
        const totalCarbs = weeklyData.reduce((acc, curr) => acc + curr.carbs, 0);
        const totalFat = weeklyData.reduce((acc, curr) => acc + curr.fat, 0);
        const totalSugar = weeklyData.reduce((acc, curr) => acc + curr.sugar, 0);

        const avgProtein = totalProtein / loggedDays;
        const avgCarbs = totalCarbs / loggedDays;
        const avgFat = totalFat / loggedDays;
        const avgSugar = totalSugar / loggedDays;

        // Simple rules based on averages per logged day
        if (avgSugar > 40) {
            recs.push({ type: 'warning', text: 'Reduce sugary foods this week' });
        }
        if (avgFat > 70) {
            recs.push({ type: 'warning', text: 'Consider leaner proteins and balanced meals to lower fat' });
        }
        if (avgProtein < 50) {
            recs.push({ type: 'info', text: 'Consider increasing protein-rich foods' });
        }
        if (calorieDiff > 700) {
            recs.push({ type: 'warning', text: 'Your calorie intake is above recommended levels. Consider calorie control or exercise.' });
        }
        if (avgCarbs > 250) {
            recs.push({ type: 'info', text: 'Carb intake is high. Ensure they come from complex sources.' });
        }

        if (recs.length === 0 && loggedDays > 0 && totalCalories > 0) {
            recs.push({ type: 'success', text: 'Great job maintaining balanced nutrition!' });
        }

        return { weightImpact: wImpact, recommendations: recs };
    }, [weeklyEntries, weeklyData]);

    const displayResult = latestResult;

    const displayNutrients = latestNutrients || {
        calories: 0, protein: 0, carbohydrates: 0, fat: 0, sugar: 0,
        sodium: 0, saturated_fat: 0, cholesterol: 0, fiber: 0
    };

    const hasData = recentlyAnalyzed.length > 0 || latestResult !== null || dailyTotals.calories > 0 || loading;

    // Helper: Calculate Health Impact based on user profile and current food
    function calculateHealthImpact(nutrients, prefs, foodName = "") {
        if (!nutrients || !prefs) return [];

        const nSugar = nutrients.sugar || 0;
        const nCarbs = nutrients.carbohydrates || 0;
        const nSodium = nutrients.sodium || 0;
        const nSatFat = nutrients.saturated_fat || 0;
        const nChol = nutrients.cholesterol || 0;
        const fName = foodName.toLowerCase();

        const impacts = [];

        const parseRiskLevel = (val) => {
            if (val === 'High' || val === 'Severe') return 3;
            if (val === 'Medium' || val === 'Mild') return 2;
            if (val === 'Low' || val === 'None' || val === 'Unknown') return 0;
            return Number(val) || 0;
        };

        // 1. Diabetes Risk (Sugar / Carbs)
        // threshold scales down as risk level goes up. Level 0 = normal (High threshold), Level 4 = extreme (Low threshold)
        const dLevel = parseRiskLevel(prefs.diabetes);
        const maxSugar = 50 - (dLevel * 10); // L0: 50g, L4: 10g max per meal
        let dImpact = 'Safe';
        let dPct = 0;
        if (nSugar > maxSugar) { dImpact = 'High'; dPct = Math.round(((nSugar - maxSugar) / maxSugar) * 100); }
        else if (nSugar > maxSugar * 0.6) { dImpact = 'Moderate'; dPct = Math.round(((nSugar - (maxSugar * 0.6)) / (maxSugar * 0.6)) * 100); }
        impacts.push({ name: 'Diabetes Risk', level: dImpact, pct: dPct, color: dImpact === 'Safe' ? '#10b981' : dImpact === 'Moderate' ? '#f59e0b' : '#ef4444' });

        // 2. Blood Pressure (Sodium) 
        // Note: We might not have consistent sodium from edamam easily, but if we do...
        const bpLevel = parseRiskLevel(prefs.hypertension);
        const maxSodium = 800 - (bpLevel * 150); // L0: 800mg, L4: 200mg
        let bpImpact = 'Safe'; let bpPct = 0;
        if (nSodium > maxSodium) { bpImpact = 'High'; bpPct = Math.round(((nSodium - maxSodium) / maxSodium) * 100); }
        else if (nSodium > maxSodium * 0.7) { bpImpact = 'Moderate'; bpPct = Math.round(((nSodium - (maxSodium * 0.7)) / (maxSodium * 0.7)) * 100); }
        impacts.push({ name: 'Blood Pressure', level: bpImpact, pct: bpPct, color: bpImpact === 'Safe' ? '#10b981' : bpImpact === 'Moderate' ? '#f59e0b' : '#ef4444' });

        // 3. Cholesterol (Sat Fat)
        const cLevel = parseRiskLevel(prefs.cholesterol);
        const maxSatFat = 15 - (cLevel * 3); // L0: 15g, L4: 3g
        let cImpact = 'Safe'; let cPct = 0;
        if (nSatFat > maxSatFat) { cImpact = 'High'; cPct = Math.round(((nSatFat - maxSatFat) / maxSatFat) * 100); }
        else if (nSatFat > maxSatFat * 0.6) { cImpact = 'Moderate'; cPct = Math.round(((nSatFat - (maxSatFat * 0.6)) / (maxSatFat * 0.6)) * 100); }
        impacts.push({ name: 'Cholesterol', level: cImpact, pct: cPct, color: cImpact === 'Safe' ? '#10b981' : cImpact === 'Moderate' ? '#f59e0b' : '#ef4444' });

        // 4. Lactose Intolerance 
        const lLevel = parseRiskLevel(prefs.lactose);
        const dairyWords = ['milk', 'cheese', 'yogurt', 'butter', 'cream', 'whey', 'lactose', 'pizza', 'ice cream'];
        const hasDairy = dairyWords.some(w => fName.includes(w));
        let lImpact = 'Safe';
        if (hasDairy && lLevel > 1) {
            lImpact = lLevel >= 3 ? 'High' : 'Moderate';
        }
        impacts.push({ name: 'Lactose Intolerance', level: lImpact, pct: hasDairy ? (lLevel * 25) : 0, color: lImpact === 'Safe' ? '#10b981' : lImpact === 'Moderate' ? '#f59e0b' : '#ef4444' });

        return impacts;
    }

    // Helper: Intelligent Feedback based on computed impacts
    function getIntelligentFeedback(impacts) {
        if (!impacts || impacts.length === 0) return [];
        const insights = [];

        const diabetes = impacts.find(i => i.name === 'Diabetes Risk');
        if (diabetes && (diabetes.level === 'High' || diabetes.level === 'Moderate')) {
            insights.push('This food may elevate glucose levels.');
        }

        const bp = impacts.find(i => i.name === 'Blood Pressure');
        if (bp && (bp.level === 'High' || bp.level === 'Moderate')) {
            insights.push('May increase blood pressure.');
        }

        const chol = impacts.find(i => i.name === 'Cholesterol');
        if (chol && (chol.level === 'High' || chol.level === 'Moderate')) {
            insights.push('May elevate cholesterol levels.');
        }

        const lactose = impacts.find(i => i.name === 'Lactose Intolerance');
        if (lactose && (lactose.level === 'High' || lactose.level === 'Moderate')) {
            insights.push('May cause digestive discomfort.');
        }

        return insights;
    }

    // Format AI response text into structured JSX
    function formatAIText(text) {
        if (!text) return text;
        const lines = text.split('\n').filter(line => line.trim() !== '');
        const elements = [];
        let listItems = [];

        const flushList = () => {
            if (listItems.length > 0) {
                elements.push(
                    <div key={`list-${elements.length}`} style={{ display: 'flex', flexDirection: 'column', gap: '6px', margin: '6px 0' }}>
                        {listItems.map((item, idx) => (
                            <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                <span style={{ color: '#3b82f6', fontWeight: 700, fontSize: '0.85rem', minWidth: '18px', flexShrink: 0 }}>{item.marker}</span>
                                <span style={{ fontSize: '0.85rem', lineHeight: 1.5 }}>{item.text}</span>
                            </div>
                        ))}
                    </div>
                );
                listItems = [];
            }
        };

        lines.forEach((line, i) => {
            const trimmed = line.trim();
            // Numbered list: "1. ...", "2) ..." etc.
            const numberedMatch = trimmed.match(/^(\d+)[.):]\s+(.*)/);
            // Bullet list
            const bulletMatch = trimmed.match(/^[-•*]\s+(.*)/);

            if (numberedMatch) {
                listItems.push({ marker: `${numberedMatch[1]}.`, text: numberedMatch[2] });
            } else if (bulletMatch) {
                listItems.push({ marker: '•', text: bulletMatch[1] });
            } else {
                flushList();
                // Bold text between ** **
                const parts = trimmed.split(/(\*\*.*?\*\*)/g).map((part, pi) => {
                    if (part.startsWith('**') && part.endsWith('**')) {
                        return <strong key={pi} style={{ fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
                    }
                    return part;
                });
                elements.push(
                    <p key={`p-${i}`} style={{ margin: '4px 0', fontSize: '0.85rem', lineHeight: 1.55 }}>{parts}</p>
                );
            }
        });
        flushList();
        return <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>{elements}</div>;
    }

    const healthImpacts = userPrefs && latestNutrients
        ? calculateHealthImpact(displayNutrients, userPrefs, searchTerm || (recentlyAnalyzed[0]?.name || ""))
        : [];

    // Visualization helpers
    // Safeguard against NaN/undefined
    const maxVal = Math.max(
        displayNutrients.protein || 0,
        displayNutrients.carbohydrates || 0,
        displayNutrients.fat || 0,
        displayNutrients.sugar || 0,
        10
    );
    const getBarWidth = (val) => `${(val / maxVal) * 100}%`;

    // Chart Data Preparation
    const macroData = [
        { name: 'Protein', value: Math.round(dailyTotals.protein), color: '#10b981' },
        { name: 'Carbs', value: Math.round(dailyTotals.carbs), color: '#3b82f6' },
        { name: 'Fat', value: Math.round(dailyTotals.fat), color: '#f59e0b' },
        { name: 'Sugar', value: Math.round(dailyTotals.sugar), color: '#ef4444' },
    ].filter(m => m.value > 0);

    const todayStr = new Date().toLocaleDateString('en-CA');
    const todaysEntriesData = dailyEntries.filter(e => e.date === todayStr);

    // Reverse them to chronological order (they are sorted desc)
    const chronologicalEntries = [...todaysEntriesData].reverse();
    let cumulativeCalories = 0;
    const dailyTrendData = chronologicalEntries.map((entry, idx) => {
        cumulativeCalories += Number(entry.calories || 0);
        return {
            name: `Meal ${idx + 1}`,
            calories: Math.round(cumulativeCalories)
        };
    });
    // Add start point
    if (dailyTrendData.length > 0) {
        dailyTrendData.unshift({ name: 'Start', calories: 0 });
    }

    return (
        <div className="dashboard-layout">
            <main className="dashboard-main">
                <div className="dashboard-grid">

                    {/* DASHBOARD HEADER: GREETING & CLOCK */}
                    <div className="dashboard-header-modern" style={{ gridColumn: '1 / -1', marginBottom: '2rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem' }}>
                            <div style={{ textAlign: 'left', flex: 1 }}>
                                <GreetingText
                                    key={`${greeting}-${firstName}`}
                                    text={`${greeting}, ${firstName}.`}
                                    className="greeting-split-text"
                                    delay={40}
                                    duration={1.2}
                                    ease="power2.out"
                                    textAlign="left"
                                    tag="h1"
                                    enableScrollTrigger={false}
                                    style={{ 
                                        fontSize: '3.5rem', 
                                        fontWeight: 800, 
                                        color: '#1e293b', 
                                        margin: 0, 
                                        letterSpacing: '-0.015em',
                                        lineHeight: 1.3,
                                        paddingBottom: '0.15em',
                                        display: 'block'
                                    }}
                                />
                                <motion.p 
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 0.3, duration: 0.8 }}
                                    style={{ 
                                        fontSize: '1.125rem', 
                                        color: '#64748b', 
                                        marginTop: '0.75rem', 
                                        fontWeight: 500 
                                    }}
                                >
                                    {healthStats.status === 'first_week' ? (
                                        "Analyzing your first week of dietary trends..."
                                    ) : (
                                        <>Your metabolic health is <strong style={{ color: healthStats.status === 'positive' ? '#10b981' : '#ef4444', fontWeight: 700 }}>{healthStats.improvement}% {healthStats.status === 'positive' ? 'healthier' : 'lower'}</strong> than last week.</>
                                    )}
                                </motion.p>
                            </div>

                            <motion.div 
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.8, ease: "easeOut" }}
                                style={{ textAlign: 'right' }}
                            >
                                <div style={{ 
                                    fontSize: '2.5rem', 
                                    fontWeight: 700, 
                                    color: '#1e293b', 
                                    letterSpacing: '-0.02em' 
                                }}>
                                    {formattedTime}
                                </div>
                                <div style={{ 
                                    fontSize: '1rem', 
                                    color: '#94a3b8', 
                                    fontWeight: 600, 
                                    textTransform: 'uppercase', 
                                    letterSpacing: '0.05em',
                                    marginTop: '0.25rem'
                                }}>
                                    {formattedDate}
                                </div>
                            </motion.div>
                        </div>
                    </div>

                    {/* LEFT COLUMN: Input & Analysis */}
                    <div className="dashboard-left-col">
                        {/* A. FOOD INPUT CARD - REDESIGNED AS GLASS DOCK */}
                        <div className="card input-card" id="analyze" style={{
                            background: 'rgba(255, 255, 255, 0.2)',
                            backdropFilter: 'blur(32px)',
                            border: '1px solid rgba(255, 255, 255, 0.5)',
                            padding: '32px',
                            borderRadius: '40px',
                            boxShadow: '0 20px 50px -10px rgba(0, 0, 0, 0.1)',
                            marginBottom: '1rem'
                        }}>
                            <h3 style={{ marginBottom: '1.5rem', color: '#1e293b', opacity: 0.8 }}>Add Food Entry</h3>
                            <div className="search-container" style={{
                                background: 'rgba(255, 255, 255, 0.4)',
                                borderRadius: '50px',
                                padding: '6px',
                                border: '1px solid rgba(255, 255, 255, 0.6)',
                                boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.02)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}>
                                <div style={{ position: 'relative', flex: 1 }}>
                                    <input
                                        type="text"
                                        placeholder="Smart Food Entry (e.g., '2 pizzas and 1 coke')..."
                                        value={searchTerm}
                                        onChange={handleSearch}
                                        className="search-input"
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            boxShadow: 'none',
                                            padding: '12px 24px',
                                            fontSize: '1.05rem',
                                            backdropFilter: 'none',
                                            width: '100%'
                                        }}
                                    />
                                    {searchResults.length > 0 && (
                                        <ul className="search-suggestions" style={{ left: '-10px', right: '-10px', top: 'calc(100% + 20px)' }}>
                                            {searchResults.map((item, idx) => (
                                                <li key={idx}
                                                    onClick={() => handleSelectFood(item)}
                                                    className="search-suggestion-item"
                                                >
                                                    <span className="suggestion-name">{item.food}</span>
                                                    <span className="suggestion-cal">({item.caloric_value} kcal)</span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                                <div style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '8px', 
                                    padding: '0 10px',
                                    borderLeft: '1.5px solid rgba(255, 255, 255, 0.4)',
                                    margin: '0 5px'
                                }}>
                                    <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Qty</span>
                                    <input
                                        type="number"
                                        min="1"
                                        step="1"
                                        value={quantity}
                                        onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                                        style={{
                                            width: '55px',
                                            background: 'rgba(255, 255, 255, 0.25)',
                                            border: '1.5px solid rgba(255, 255, 255, 0.5)',
                                            borderRadius: '12px',
                                            padding: '6px 4px',
                                            fontSize: '1rem',
                                            color: '#1e293b',
                                            textAlign: 'center',
                                            fontWeight: 700,
                                            outline: 'none',
                                            boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
                                            transition: 'all 0.2s ease'
                                        }}
                                        onFocus={(e) => e.target.style.borderColor = '#3b82f6'}
                                        onBlur={(e) => e.target.style.borderColor = 'rgba(255, 255, 255, 0.5)'}
                                    />
                                </div>
                                <GlassButton
                                    onClick={handleAnalyze}
                                    disabled={loading}
                                    className="btn-analyze-glass"
                                >
                                    {loading ? <ButtonSpinner text="Analyzing..." color="#ffffff" /> : "Analyze Health Impact"}
                                </GlassButton>
                            </div>
                            {error && <div style={{ color: '#ef4444', marginTop: '1rem', textAlign: 'center', fontSize: '0.9rem' }}>{error}</div>}
                        </div>

                        {!hasData ? (
                            <div className="card welcome-empty-state" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                                <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>👋</div>
                                <h2 style={{ fontSize: '1.8rem', color: '#1e293b', marginBottom: '0.5rem', fontWeight: 600 }}>Welcome to Ingrelyze</h2>
                                <p style={{ color: '#64748b', fontSize: '1.1rem', maxWidth: '500px', margin: '0 auto' }}>Start by adding your first food entry above to see your health breakdown.</p>
                            </div>
                        ) : null}

                        {hasData && (
                            <>
                                {/* B. ANALYSIS RESULTS CARD */}
                                <div className="card result-card" style={{ position: 'relative' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <h3>Analysis Result</h3>
                                        {latestFoodName && (
                                            <div style={{
                                                display: 'inline-flex', alignItems: 'center', gap: '6px',
                                                background: latestResult
                                                    ? `${getGradeInfo(latestResult.health_level).bg}18`
                                                    : 'rgba(241,245,249,0.9)',
                                                border: `1.5px solid ${latestResult ? `${getGradeInfo(latestResult.health_level).bg}50` : '#e2e8f0'}`,
                                                borderRadius: '100px',
                                                padding: '5px 14px 5px 8px',
                                                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                                                transition: 'all 0.3s ease',
                                                maxWidth: '220px',
                                            }}>
                                                <span style={{
                                                    background: latestResult
                                                        ? getGradeInfo(latestResult.health_level).bg
                                                        : '#94a3b8',
                                                    color: '#fff',
                                                    borderRadius: '100px',
                                                    padding: '2px 10px',
                                                    fontSize: '0.72rem',
                                                    fontWeight: 700,
                                                    letterSpacing: '0.03em',
                                                    textTransform: 'uppercase',
                                                    flexShrink: 0,
                                                }}>
                                                    {latestResult ? getGradeInfo(latestResult.health_level).grade : '–'}
                                                </span>
                                                <span style={{
                                                    fontSize: '0.82rem',
                                                    fontWeight: 600,
                                                    color: '#334155',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                }}>
                                                    {latestFoodName} {latestQuantity > 1 && <span style={{ opacity: 0.7, marginLeft: '4px' }}>(x{latestQuantity})</span>}
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    {latestResult ? (
                                        <div className="health-score-display">
                                            <div className="progress-ring-container">
                                                <svg className="progress-ring" width="140" height="140">
                                                    <defs>
                                                        <linearGradient id="score-gradient" x1="0%" y1="100%" x2="100%" y2="0%">
                                                            <stop offset="0%" stopColor={getGradeInfo(displayResult.health_level).bg} />
                                                            <stop offset="100%" stopColor={getGradeInfo(displayResult.health_level).bg} stopOpacity="0.5" />
                                                        </linearGradient>
                                                    </defs>
                                                    <circle
                                                        className="progress-ring-track"
                                                        strokeWidth="8"
                                                        fill="transparent"
                                                        r="62"
                                                        cx="70"
                                                        cy="70"
                                                        stroke="rgba(255, 255, 255, 0.3)"
                                                    />
                                                    <circle
                                                        className="progress-ring-circle"
                                                        strokeWidth="8"
                                                        fill="transparent"
                                                        r="62"
                                                        cx="70"
                                                        cy="70"
                                                        stroke="url(#score-gradient)"
                                                        style={{
                                                            strokeDasharray: 2 * Math.PI * 62,
                                                            strokeDashoffset: ringOffset,
                                                            transition: ringOffset === (2 * Math.PI * 62) ? 'none' : 'stroke-dashoffset 1.5s cubic-bezier(0.25, 0.8, 0.25, 1)'
                                                        }}
                                                    />
                                                </svg>
                                                <div className="progress-ring-content">
                                                    <span className="score-grade" style={{ color: getGradeInfo(displayResult.health_level).text }}>
                                                        {getGradeInfo(displayResult.health_level).grade}
                                                    </span>
                                                    {getGradeInfo(displayResult.health_level).level >= 0 && (
                                                        <span className="score-level-text">
                                                            Level {getGradeInfo(displayResult.health_level).level}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="feedback-pill" style={{
                                                backgroundColor: `${getGradeInfo(displayResult.health_level).bg}15`,
                                                color: getGradeInfo(displayResult.health_level).text
                                            }}>
                                                {getGradeInfo(displayResult.health_level).feedback}
                                            </div>

                                            <span className="health-label" style={{
                                                color: getGradeInfo(displayResult.health_level).text
                                            }}>
                                                {displayResult.health_label}
                                            </span>

                                            <p className="health-explanation">
                                                {displayResult.explanation}
                                            </p>

                                            {displayResult.warnings && displayResult.warnings.length > 0 ? (
                                                <div className="warning-box">
                                                    <strong>⚠️ Attention Needed:</strong>
                                                    <ul style={{ paddingLeft: '1.2rem', margin: '0.5rem 0 0 0' }}>
                                                        {displayResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
                                                    </ul>
                                                </div>
                                            ) : (
                                                <div style={{ marginTop: '1rem', color: '#10b981', fontWeight: 600 }}>
                                                    ✅ Great choice! No warnings.
                                                </div>
                                            )}

                                            {getIntelligentFeedback(healthImpacts).length > 0 && (
                                                <div style={{
                                                    marginTop: '1.5rem',
                                                    padding: '1rem',
                                                    backgroundColor: 'rgba(255, 255, 255, 0.4)',
                                                    borderRadius: '12px',
                                                    borderLeft: '4px solid #3b82f6'
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                                        <span style={{ fontSize: '1.2rem' }}>💡</span>
                                                        <strong style={{ color: '#1e293b', fontSize: '0.95rem' }}>Intelligent Feedback</strong>
                                                    </div>
                                                    <ul style={{
                                                        margin: 0,
                                                        paddingLeft: '1.5rem',
                                                        color: '#475569',
                                                        fontSize: '0.9rem',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        gap: '6px'
                                                    }}>
                                                        {getIntelligentFeedback(healthImpacts).map((insight, idx) => (
                                                            <li key={idx}>{insight}</li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="empty-state" style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                                            <div style={{ fontSize: '2rem', marginBottom: '1rem', opacity: 0.5 }}>📊</div>
                                            {loading ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                                                    <RoundSpinner size="lg" color="#3b82f6" />
                                                    <p>Analyzing food...</p>
                                                </div>
                                            ) : (
                                                <p>Start by analyzing a food to see results here.</p>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* C. NUTRITION BREAKDOWN CARD */}
                                <div className="card nutrition-card">
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <h3>Nutritional Breakdown</h3>
                                        <span style={{ fontSize: '0.9rem', color: '#64748b' }}>Per Serving/Entry</span>
                                    </div>

                                    {latestResult ? (
                                        <div className="nutrient-bars">
                                            <div className="nutrient-row">
                                                <span className="nutrient-label">Protein</span>
                                                <div className="bar-bg">
                                                    <div className="bar-fill" style={{ width: getBarWidth(displayNutrients.protein), background: 'linear-gradient(90deg, #34d399, #10b981)' }}></div>
                                                </div>
                                                <span className="nutrient-val">{Number(displayNutrients.protein || 0).toFixed(1)}g</span>
                                            </div>
                                            <div className="nutrient-row">
                                                <span className="nutrient-label">Carbs</span>
                                                <div className="bar-bg">
                                                    <div className="bar-fill" style={{ width: getBarWidth(displayNutrients.carbohydrates), background: 'linear-gradient(90deg, #60a5fa, #3b82f6)' }}></div>
                                                </div>
                                                <span className="nutrient-val">{Number(displayNutrients.carbohydrates || 0).toFixed(1)}g</span>
                                            </div>
                                            <div className="nutrient-row">
                                                <span className="nutrient-label">Fat</span>
                                                <div className="bar-bg">
                                                    <div className="bar-fill" style={{ width: getBarWidth(displayNutrients.fat), background: 'linear-gradient(90deg, #fbbf24, #f59e0b)' }}></div>
                                                </div>
                                                <span className="nutrient-val">{Number(displayNutrients.fat || 0).toFixed(1)}g</span>
                                            </div>
                                            <div className="nutrient-row">
                                                <span className="nutrient-label">Sugar</span>
                                                <div className="bar-bg">
                                                    <div className="bar-fill" style={{ width: getBarWidth(displayNutrients.sugar), background: 'linear-gradient(90deg, #f87171, #ef4444)' }}></div>
                                                </div>
                                                <span className="nutrient-val">{Number(displayNutrients.sugar || 0).toFixed(1)}g</span>
                                            </div>

                                            <hr style={{ border: 0, borderTop: '1px solid #f1f5f9', margin: '1rem 0' }} />

                                            <div className="nutrient-row">
                                                <span className="nutrient-label">Fiber</span>
                                                <div className="bar-bg">
                                                    <div className="bar-fill" style={{ width: getBarWidth(displayNutrients.fiber), background: 'linear-gradient(90deg, #2dd4bf, #14b8a6)' }}></div>
                                                </div>
                                                <span className="nutrient-val">{Number(displayNutrients.fiber || 0).toFixed(1)}<span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#94a3b8' }}>g</span></span>
                                            </div>

                                            <hr style={{ border: 0, borderTop: '1px solid #f1f5f9', margin: '1rem 0' }} />

                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span className="nutrient-label" style={{ width: 'auto' }}>Total Calories</span>
                                                <span style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1e293b' }}>{Number(displayNutrients.calories || 0).toFixed(1)} <small style={{ fontSize: '0.8rem', fontWeight: 400, color: '#64748b' }}>kcal</small></span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="empty-state" style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                                            <div style={{ fontSize: '2rem', marginBottom: '1rem', opacity: 0.5 }}>🔬</div>
                                            <p>Nutritional facts will appear here.</p>
                                        </div>
                                    )}
                                </div>

                                {/* E. CHARTS SECTION (LEFT COL) */}
                                <div className="card charts-card">
                                    <h3 style={{ marginBottom: '1.5rem' }}>Daily Insights</h3>
                                    <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>

                                        {/* MACRO PIE CHART */}
                                        <div style={{ flex: '1 1 200px', minWidth: '250px' }}>
                                            <h4 style={{ fontSize: '1rem', color: '#64748b', marginBottom: '1rem', textAlign: 'center' }}>Macro Distribution</h4>
                                            {macroData.length > 0 ? (
                                                <div style={{ width: '100%', height: '220px' }}>
                                                    <ResponsiveContainer>
                                                        <PieChart>
                                                            <Pie
                                                                data={macroData}
                                                                innerRadius={65}
                                                                outerRadius={85}
                                                                paddingAngle={6}
                                                                cornerRadius={10}
                                                                dataKey="value"
                                                                isAnimationActive={true}
                                                                animationDuration={1500}
                                                                animationEasing="ease-out"
                                                            >
                                                                {macroData.map((entry, index) => (
                                                                    <Cell key={`cell-${index}`} fill={entry.color} stroke="none" style={{ filter: 'drop-shadow(0px 4px 6px rgba(0,0,0,0.05))' }} />
                                                                ))}
                                                            </Pie>
                                                            <Tooltip
                                                                contentStyle={{ borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.8)', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', backgroundColor: 'rgba(255, 255, 255, 0.85)', backdropFilter: 'blur(16px)', padding: '12px' }}
                                                                itemStyle={{ color: '#1e293b', fontWeight: 600, paddingBottom: 0 }}
                                                                formatter={(value) => `${Number(value).toFixed(1)}g`}
                                                            />
                                                            <Legend verticalAlign="bottom" height={36} iconType="circle" />
                                                        </PieChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            ) : (
                                                <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                                                    No macro data today
                                                </div>
                                            )}
                                        </div>

                                        {/* CALORIE TREND LINE CHART */}
                                        <div style={{ flex: '2 1 300px', minWidth: '300px' }}>
                                            <h4 style={{ fontSize: '1rem', color: '#64748b', marginBottom: '1rem', textAlign: 'center' }}>Calorie Trend Today</h4>
                                            {dailyTrendData.length > 1 ? (
                                                <div style={{ width: '100%', height: '220px' }}>
                                                    <ResponsiveContainer>
                                                        <LineChart data={dailyTrendData} margin={{ top: 10, right: 20, bottom: 10, left: -20 }}>
                                                            <defs>
                                                                <linearGradient id="line-gradient" x1="0" y1="0" x2="1" y2="0">
                                                                    <stop offset="0%" stopColor="#3b82f6" />
                                                                    <stop offset="100%" stopColor="#8b5cf6" />
                                                                </linearGradient>
                                                            </defs>
                                                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} padding={{ left: 20, right: 20 }} />
                                                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                                                            <Tooltip
                                                                contentStyle={{ borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.8)', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', backgroundColor: 'rgba(255, 255, 255, 0.85)', backdropFilter: 'blur(16px)', padding: '12px', zIndex: 100 }}
                                                                itemStyle={{ color: '#1e293b', fontWeight: 600 }}
                                                                formatter={(value) => `${Math.round(value)} kcal`}
                                                            />
                                                            <Line
                                                                type="monotone"
                                                                dataKey="calories"
                                                                stroke="url(#line-gradient)"
                                                                strokeWidth={4}
                                                                isAnimationActive={true}
                                                                animationDuration={1500}
                                                                animationEasing="ease-out"
                                                                dot={{ fill: '#3b82f6', strokeWidth: 0, r: 4 }}
                                                                activeDot={{ r: 8, strokeWidth: 0, fill: '#3b82f6', style: { filter: 'drop-shadow(0px 0px 6px rgba(59,130,246,0.6))' } }}
                                                            />
                                                        </LineChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            ) : (
                                                <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                                                    Not enough data for trend
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* RIGHT COLUMN: Analytics/History */}
                    <div className="dashboard-right-col">
                        {hasData && (
                            <>
                                {/* NEW CARD: HEALTH IMPACT OVERVIEW */}
                                {healthImpacts.length > 0 && (
                                    <div className="card impact-card">
                                        <h3>Health Impact Overview</h3>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                            {healthImpacts.map((impact, idx) => (
                                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '12px', borderBottom: idx < healthImpacts.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: impact.color }}></div>
                                                        <span style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.9rem' }}>{impact.name}</span>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 500 }}>{impact.level}</span>
                                                        {impact.level !== 'Safe' && impact.pct > 0 && (
                                                            <span style={{
                                                                background: `${impact.color}20`,
                                                                color: impact.color,
                                                                padding: '4px 8px',
                                                                borderRadius: '8px',
                                                                fontSize: '0.75rem',
                                                                fontWeight: 700
                                                            }}>
                                                                +{impact.pct}% Impact
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* DAILY TRACKER */}
                                <div className="card daily-card">
                                    <div style={{ marginBottom: '24px' }}>
                                        <h3 style={{ margin: 0, fontWeight: 700, fontSize: '1.15rem', color: '#1e293b' }}>Today's Total</h3>
                                        <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '4px', fontWeight: 500, display: 'block' }}>
                                            {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {[
                                            { label: 'Calories', val: dailyTotals.calories, unit: 'kcal' },
                                            { label: 'Protein', val: dailyTotals.protein, unit: 'g' },
                                            { label: 'Carbs', val: dailyTotals.carbs, unit: 'g' },
                                            { label: 'Fat', val: dailyTotals.fat, unit: 'g' },
                                            { label: 'Sugar', val: dailyTotals.sugar, unit: 'g' }
                                        ].map((item, idx) => {
                                            let color = '#10b981'; // Default Green
                                            const val = item.val;
                                            switch (item.label) {
                                                case 'Calories': if (val <= 2000) color = '#10b981'; else if (val <= 2500) color = '#f59e0b'; else color = '#ef4444'; break;
                                                case 'Sugar': if (val <= 25) color = '#10b981'; else if (val <= 50) color = '#f59e0b'; else color = '#ef4444'; break;
                                                case 'Fat': if (val <= 70) color = '#10b981'; else if (val <= 90) color = '#f59e0b'; else color = '#ef4444'; break;
                                                case 'Carbs': if (val <= 250) color = '#10b981'; else if (val <= 350) color = '#f59e0b'; else color = '#ef4444'; break;
                                                case 'Protein': if (val < 50) color = '#f59e0b'; else if (val > 200) color = '#ef4444'; else if (val <= 150) color = '#10b981'; else color = '#f59e0b'; break;
                                                default: color = '#64748b';
                                            }
                                            return (
                                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: idx < 4 ? '1px solid #f1f5f9' : 'none' }}>
                                                    <span style={{ color: '#64748b', fontSize: '0.9rem' }}>{item.label}</span>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: color }}></div>
                                                        <span style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.95rem' }}>
                                                            {Math.round(item.val)} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#94a3b8' }}>{item.unit}</span>
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>




                                {/* WEEKLY HEALTH SUMMARY LINK */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '32px', marginTop: '32px', width: '100%' }}>
                                    <FlowButton
                                        text="View Detailed Weekly Report"
                                        onClick={() => navigate('/weekly-report')}
                                    />
                                </div>
                                {/* FLOATING AI ASSISTANT OVERLAY */}
                                <div style={{ position: 'fixed', bottom: '40px', right: '40px', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '20px' }}>

                                    {/* The toggled chat dialog */}
                                    {isChatOpen && (
                                        <div className="card chat-dialog-enter" style={{
                                            width: '360px',
                                            background: 'rgba(255, 255, 255, 0.7)',
                                            backdropFilter: 'blur(24px)',
                                            border: '1px solid rgba(255, 255, 255, 0.8)',
                                            boxShadow: '0 20px 40px -10px rgba(31, 38, 135, 0.15)',
                                            marginBottom: '10px',
                                            padding: '24px'
                                        }}>
                                            <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b', fontSize: '1.1rem' }}>
                                                <span style={{ fontSize: '1.25rem' }}>✨</span> AI Nutrition Assistant
                                            </h3>

                                            <div className="ai-chat-scroll" style={{
                                                width: '100%',
                                                height: '240px',
                                                background: 'rgba(255, 255, 255, 0.3)',
                                                borderRadius: '16px',
                                                marginBottom: '16px',
                                                padding: '12px',
                                                overflowY: 'auto',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '8px'
                                            }}>
                                                {chatMessages.length === 0 ? (
                                                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.9rem', fontStyle: 'italic', textAlign: 'center' }}>
                                                        How can I help you adjust your diet today?
                                                    </div>
                                                ) : (
                                                    <>
                                                        {chatMessages.map((msg, i) => (
                                                            <ChatBubble key={i} variant={msg.sender === 'user' ? 'sent' : 'received'}>
                                                                {msg.sender === 'ai' && <ChatBubbleAvatar fallback="✨" />}
                                                                <ChatBubbleMessage variant={msg.sender === 'user' ? 'sent' : 'received'}>
                                                                    {msg.sender === 'ai' ? formatAIText(msg.text) : msg.text}
                                                                </ChatBubbleMessage>
                                                            </ChatBubble>
                                                        ))}
                                                        {isAiLoading && (
                                                            <ChatBubble variant="received">
                                                                <ChatBubbleAvatar fallback="✨" />
                                                                <ChatBubbleMessage isLoading={true} />
                                                            </ChatBubble>
                                                        )}
                                                        <div ref={chatEndRef} />
                                                    </>
                                                )}
                                            </div>

                                            <div style={{ position: 'relative' }}>
                                                <input
                                                    type="text"
                                                    placeholder="Ask about your macros..."
                                                    className="ai-chat-input"
                                                    value={aiQuery}
                                                    onChange={(e) => setAiQuery(e.target.value)}
                                                    onKeyDown={handleAiSubmit}
                                                    disabled={isAiLoading}
                                                    style={{
                                                        width: '100%',
                                                        padding: '12px 40px 12px 16px',
                                                        border: '1px solid rgba(255, 255, 255, 0.6)',
                                                        borderRadius: '24px',
                                                        fontSize: '0.95rem',
                                                        background: 'rgba(255, 255, 255, 0.4)',
                                                        color: '#1e293b',
                                                        outline: 'none',
                                                        boxShadow: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.02)'
                                                    }}
                                                />
                                                <div
                                                    onClick={() => handleAiSubmit({ key: 'Enter' })}
                                                    style={{
                                                        position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                                                        opacity: aiQuery.trim() ? 1 : 0.5,
                                                        color: aiQuery.trim() ? '#3b82f6' : '#94a3b8',
                                                        cursor: aiQuery.trim() ? 'pointer' : 'default',
                                                        transition: 'all 0.2s'
                                                    }}>
                                                    ➤
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <div style={{ position: 'relative' }}>
                                        <GlassIcons
                                            items={[{
                                                icon: isChatOpen ? '✕' : '✨',
                                                label: isChatOpen ? 'Close' : 'AI Assistant',
                                                color: 'blue',
                                                onClick: () => setIsChatOpen(!isChatOpen)
                                            }]}
                                        />
                                    </div>
                                </div>

                                {/* D. RECENT FOODS CARD */}
                                <div className="card recent-card" id="history">
                                    <h3>Recently Analyzed</h3>

                                    {recentlyAnalyzed.length > 0 ? (
                                        <ul className="recent-list">
                                            {recentlyAnalyzed.map((item) => (
                                                <li key={item.id} className="recent-item" onClick={() => handleSelectRecent(item)}>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div className="recent-name" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                                                            {item.quantity > 1 && (
                                                                <span style={{ 
                                                                    fontSize: '0.7rem', 
                                                                    color: '#64748b', 
                                                                    background: 'rgba(0,0,0,0.04)', 
                                                                    padding: '1px 6px', 
                                                                    borderRadius: '6px',
                                                                    fontWeight: 700,
                                                                    flexShrink: 0
                                                                }}>
                                                                    x{item.quantity}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{item.date}</div>
                                                    </div>
                                                    <div className="recent-score" style={{
                                                        backgroundColor: `${item.gradeInfo.bg}20`,
                                                        color: item.gradeInfo.text,
                                                        border: `1px solid ${item.gradeInfo.bg}40`
                                                    }}>
                                                        {item.gradeInfo.grade}
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p style={{ color: '#94a3b8', fontSize: '0.9rem', textAlign: 'center', marginTop: '2rem' }}>
                                            No history yet.
                                        </p>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}
