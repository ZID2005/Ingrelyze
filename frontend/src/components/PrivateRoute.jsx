import React, { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";

export default function PrivateRoute({ children }) {
    const { currentUser } = useAuth();
    const [loading, setLoading] = useState(true);
    const [hasProfile, setHasProfile] = useState(false);
    const location = useLocation();

    useEffect(() => {
        async function checkProfile() {
            if (currentUser) {
                try {
                    const docRef = doc(db, "users", currentUser.uid);
                    const docSnap = await getDoc(docRef);
                    setHasProfile(docSnap.exists());
                } catch (error) {
                    console.error("Profile check failed", error);
                }
            }
            setLoading(false);
        }
        checkProfile();
    }, [currentUser]);

    if (!currentUser) {
        return <Navigate to="/login" />;
    }

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <div className="spinner"></div>
            </div>
        );
    }

    // Use a flag for routes that don't require profile (like /profile itself)
    // However, if we wrap Profile with PrivateRoute, we must allow it.

    // If user has no profile and is NOT on /health-context, redirect to /health-context
    // This forces the "Onboarding Wizard" for new users
    if (!hasProfile && location.pathname !== "/health-context") {
        return <Navigate to="/health-context" />;
    }

    // If user HAS profile and is on /profile, allow them to stay (to edit)
    // or we could redirect to Dashboard if they try to go there during signup flow?
    // The requirement says: "After login... If preferences exist -> redirect to Dashboard".
    // "After login" usually lands on `/`.
    // So if they are on `/` and have profile -> render children (Dashboard).
    // If they are on `/` and NO profile -> redirect `/profile` (handled above).

    return children;
}
