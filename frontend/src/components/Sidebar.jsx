import React, { useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import StaggeredMenu from "./StaggeredMenu";
import "./DashboardLayout.css";

export default function Sidebar() {
    const { currentUser, logout } = useAuth();
    const navigate = useNavigate();
    const [showSettings, setShowSettings] = useState(false);

    async function handleLogout() {
        try {
            await logout();
            navigate("/login");
        } catch {
            console.error("Failed to log out");
        }
    }

    const navItems = [
        { label: "Home", link: "/", onClick: () => navigate("/") },
        { label: "Analyze", link: "/#analyze", onClick: (e) => { e.preventDefault(); window.location.hash = "analyze"; navigate("/#analyze"); } },
        { label: "History", link: "/#history", onClick: (e) => { e.preventDefault(); window.location.hash = "history"; navigate("/#history"); } },
        { label: "Profile", link: "/profile", onClick: () => navigate("/profile") },
        { label: "Settings", link: "#", onClick: () => setShowSettings(true) },
    ];

    return (
        <>
            <StaggeredMenu
                position="left"
                items={navItems}
                displaySocials={false}
                logoUrl={null}
                menuButtonColor="#059669"
                openMenuButtonColor="#ffffff"
                isFixed={true}
                className="ingrelyze-navbar"
            />

            {/* Settings Modal */}
            {showSettings && createPortal(
                <div className="modal-overlay" style={{ zIndex: 2000 }} onClick={() => setShowSettings(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Settings</h3>
                            <button className="close-btn" onClick={() => setShowSettings(false)}>×</button>
                        </div>
                        <div className="modal-body">
                            <div className="user-info">
                                <label>Logged in as</label>
                                <p>{currentUser?.email}</p>
                            </div>

                            <hr className="divider" />

                            <button onClick={handleLogout} className="btn-logout-full">
                                Log Out
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
