import React, { useRef, useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { Link, useNavigate } from "react-router-dom";

import logo from "../assets/logo.svg";
import BlurText from "../components/BlurText";
import WelcomeScreen from "../components/WelcomeScreen";

export default function Signup() {
    const firstNameRef = useRef();
    const lastNameRef = useRef();
    const emailRef = useRef();
    const passwordRef = useRef();
    const passwordConfirmRef = useRef();
    const { signup, googleLogin } = useAuth(); // Assuming googleLogin is available here too if needed
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

        if (passwordRef.current.value !== passwordConfirmRef.current.value) {
            return setError("Passwords do not match");
        }

        try {
            setError("");
            setLoading(true);
            setLoading(true);
            await signup(emailRef.current.value, passwordRef.current.value);
            // Ideally update profile with first/last name here if supported by backend/firebase structure
            setShowWelcome(true);
        } catch (err) {
            setError("Failed to create an account: " + err.message);
        }
        setLoading(false);
    }

    // Optional: Google Signup (same flow as login)
    async function handleGoogleLogin() {
        try {
            setError("");
            setLoading(true);
            setLoading(true);
            await googleLogin();
            setShowWelcome(true);
        } catch (err) {
            setError("Failed to sign up with Google: " + err.message);
        }
        setLoading(false);
    }

    if (showWelcome) {
        return (
            <WelcomeScreen
                email={currentUser?.email || emailRef.current?.value || "User"}
                onComplete={() => navigate("/health-context")}
            />
        );
    }

    return (
        <div style={{ width: '100%', maxWidth: '540px', padding: '0 1rem', position: 'relative', zIndex: 10 }}>
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                <div style={{ marginBottom: '0.25rem', fontFamily: '"Playfair Display", serif' }}>
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
                <p style={{ color: '#94a3b8', fontSize: '1rem', letterSpacing: '0.05em', fontWeight: '500', marginBottom: '0', marginTop: '0.5rem' }}>
                    Premium Nutrition Analysis
                </p>
            </div>

            <div className="dark-card" style={{ maxWidth: '100%', padding: '2rem 2.5rem' }}>

                {error && <div className="alert-error" style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#fca5a5', marginBottom: '1rem' }}>{error}</div>}

                <form onSubmit={handleSubmit}>
                    <div style={{ display: 'flex', gap: '1.25rem', marginBottom: '1rem' }}>
                        <div className="dark-input-group" style={{ flex: 1, marginBottom: 0 }}>
                            <label>First Name</label>
                            <input type="text" ref={firstNameRef} placeholder="Noah" required />
                        </div>
                        <div className="dark-input-group" style={{ flex: 1, marginBottom: 0 }}>
                            <label>Last Name</label>
                            <input type="text" ref={lastNameRef} placeholder="Smith" required />
                        </div>
                    </div>

                    <div className="dark-input-group" style={{ marginBottom: '1rem' }}>
                        <label>Email Address</label>
                        <input type="email" ref={emailRef} placeholder="name@company.com" required />
                    </div>
                    <div className="dark-input-group" style={{ marginBottom: '1rem' }}>
                        <label>Password</label>
                        <input type="password" ref={passwordRef} placeholder="••••••••" required />
                    </div>
                    <div className="dark-input-group" style={{ marginBottom: '1.5rem' }}>
                        <label>Confirm Password</label>
                        <input type="password" ref={passwordConfirmRef} placeholder="••••••••" required />
                    </div>

                    <button disabled={loading} type="submit" className="btn-white-primary" style={{ marginTop: '0' }}>
                        {loading ? "Creating Account..." : "Create account"}
                    </button>
                </form>

                <div className="dark-divider" style={{ margin: '1.5rem 0' }}>Or sign up with</div>

                <button disabled={loading} onClick={handleGoogleLogin} className="btn-dark-google">
                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" style={{ width: '20px', height: '20px' }} />
                    Google
                </button>

                <div className="dark-footer" style={{ marginTop: '1.5rem' }}>
                    Already have an account? <Link to="/login">Log in</Link>
                </div>
            </div>
        </div>
    );
}
