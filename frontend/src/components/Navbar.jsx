import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import PillNav from "./PillNav";
import Sidebar from "./Sidebar";

export default function Navbar() {
    const { currentUser, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();

    // Hide Navbar on Login, Signup, Health Context and Landing pages
    if (location.pathname === "/login" || location.pathname === "/signup" || location.pathname === "/health-context") {
        return null;
    }

    async function handleLogout() {
        try {
            await logout();
            navigate("/login");
        } catch {
            console.error("Failed to log out");
        }
    }

    const items = currentUser ? [
        { label: "Dashboard", href: "/" },
        { label: "Weekly Report", href: "/weekly-report" },
        { label: "Profile", href: "/profile" },
        { label: "Log Out", href: "#", onClick: handleLogout }
    ] : [
        { label: "Home", href: "/" },
        { label: "Log In", href: "/login" },
        { label: "Sign Up", href: "/signup" }
    ];

    return (
        <header className="navbar-header" style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            paddingTop: '2rem',
            paddingBottom: '2rem',
            width: '100%',
        }}>
            <PillNav
                logo=""
                items={items}
                activeHref={location.pathname}
                leftSlot={currentUser ? <Sidebar /> : null}
            />
        </header>
    );
}
