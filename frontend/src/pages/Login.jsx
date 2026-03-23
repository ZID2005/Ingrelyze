import React, { useRef, useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { Link, useNavigate } from "react-router-dom";
import GreetingText from "../components/GreetingText";
import BlurText from "../components/BlurText";
import WelcomeScreen from "../components/WelcomeScreen";
import { ButtonSpinner } from '../components/Spinner';

import logo from "../assets/logo.svg";

export default function Login() {
    const emailRef = useRef();
    const passwordRef = useRef();
    const { login, googleLogin } = useAuth();
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [showWelcome, setShowWelcome] = useState(false);
    const navigate = useNavigate();
    const { currentUser } = useAuth();

    useEffect(() => {
        if (currentUser && !loading && !showWelcome) {
            navigate("/");
        }
    }, [currentUser, navigate, loading, showWelcome]);

    async function handleSubmit(e) {
        e.preventDefault();

        try {
            setError("");
            setLoading(true);
            await login(emailRef.current.value, passwordRef.current.value);
            setShowWelcome(true);
        } catch (err) {
            console.error("Login error:", err);
            let msg = "Failed to log in.";
            if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
                msg = "No account found with these credentials. Please Sign Up if you are new.";
            } else if (err.code === 'auth/wrong-password') {
                msg = "Incorrect password.";
            } else if (err.code === 'auth/invalid-email') {
                msg = "Invalid email format.";
            } else if (err.code === 'auth/too-many-requests') {
                msg = "Too many failed attempts. Please try again later.";
            }
            setError(msg);
        }
        setLoading(false);
    }

    async function handleGoogleLogin() {
        try {
            setError("");
            setLoading(true);
            const result = await googleLogin();
            console.log("Google login success:", result);
            setShowWelcome(true);
        } catch (err) {
            console.error("Google login error details:", err);
            console.error("Error code:", err.code);
            console.error("Error message:", err.message);
            
            let errorMessage = "Failed to log in with Google. Please try again.";
            
            if (err.code === 'auth/unauthorized-domain') {
                errorMessage = "This domain (ingrelyze.vercel.app) is not authorized in Firebase. Please add it to 'Authorized domains' in the Firebase Console.";
            } else if (err.code === 'auth/popup-blocked') {
                errorMessage = "Sign-in popup was blocked by your browser. Please enable popups and try again.";
            } else if (err.code === 'auth/operation-not-allowed') {
                errorMessage = "Google sign-in is not enabled in your Firebase project. Please enable it in the Firebase Console.";
            }
            
            setError(errorMessage);
        }
        setLoading(false);
    }

    if (showWelcome) {
        return (
            <WelcomeScreen
                email={currentUser?.email || emailRef.current?.value || "User"}
                onComplete={() => navigate("/")}
            />
        );
    }

    return (
        <div style={{ width: '100%', maxWidth: '420px', padding: '1rem', position: 'relative', zIndex: 10 }}>
            <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
                <div style={{ marginBottom: '0.5rem', fontFamily: '"Playfair Display", serif' }}>
                    <div style={{ fontSize: '3.5rem', fontWeight: '800', letterSpacing: '-0.02em', lineHeight: '1.2' }}>
                        <BlurText
                            text="Ingrelyze"
                            delay={150}
                            animateBy="letters"
                            direction="top"
                            textColor="#ffffff"
                            className=""
                        />
                    </div>
                </div>
                <p style={{ color: '#94a3b8', fontSize: '1rem', letterSpacing: '0.05em', fontWeight: '500', marginBottom: '0' }}>
                    Premium Nutrition Analysis
                </p>
            </div>

            <div className="dark-card">
                {error && <div className="alert-error" style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#fca5a5' }}>{error}</div>}

                <form onSubmit={handleSubmit}>
                    <div className="dark-input-group">
                        <label>Email Address</label>
                        <input type="email" ref={emailRef} placeholder="name@company.com" required />
                    </div>
                    <div className="dark-input-group">
                        <label>Password</label>
                        <input type="password" ref={passwordRef} placeholder="••••••••" required />
                    </div>

                    <div className="form-group-checkbox" style={{ border: 'none', padding: 0, marginBottom: '1.5rem' }}>
                        <label style={{ fontSize: '0.875rem', color: '#94a3b8' }}>
                            <input type="checkbox" style={{ width: '1rem', height: '1rem', accentColor: 'white' }} />
                            Remember me
                        </label>
                    </div>

                    <button disabled={loading} type="submit" className="btn-white-primary">
                        {loading ? <ButtonSpinner text="Signing In..." color="#1e293b" /> : "Sign In"}
                    </button>
                </form>

                <div className="dark-divider">Or sign in with</div>

                <button disabled={loading} onClick={handleGoogleLogin} className="btn-dark-google">
                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" style={{ width: '20px', height: '20px' }} />
                    Google
                </button>

                <div className="dark-footer">
                    Don't have an account? <Link to="/signup">Sign up</Link>
                </div>
            </div>
        </div>
    );
}
