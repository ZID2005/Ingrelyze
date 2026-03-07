import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import PrivateRoute from "./components/PrivateRoute";
import Navbar from "./components/Navbar"; // Keep for now if needed by other comps, but App uses MainLayout
import MainLayout from "./components/MainLayout";
import Dashboard from "./pages/Dashboard";
import WeeklyReport from "./pages/WeeklyReport";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Profile from "./pages/Profile";
import HealthContext from "./pages/HealthContext";
import AuthLayout from "./components/AuthLayout";
import DarkVeil from "./components/DarkVeil";
import "./App.css";

function App() {
  return (
    <>
      <DarkVeil speed={0.5} hueShift={0} noiseIntensity={0.03} scanlineIntensity={0.1} warpAmount={0.6} />
      <Router>
        <AuthProvider>
          <Routes>
            {/* Main Layout Routes (Navbar + Container) */}
            <Route element={<MainLayout />}>
              <Route
                path="/"
                element={
                  <PrivateRoute>
                    <Dashboard />
                  </PrivateRoute>
                }
              />
              <Route
                path="/weekly-report"
                element={
                  <PrivateRoute>
                    <WeeklyReport />
                  </PrivateRoute>
                }
              />
              {/* Health Context moved to AuthLayout for full screen wizard */}
            </Route>

            {/* Standalone Profile Route (No Navbar, Full Screen) */}
            <Route
              path="/profile"
              element={
                <PrivateRoute>
                  <Profile />
                </PrivateRoute>
              }
            />

            {/* Auth Layout Routes (Login, Signup, Health Context) */}
            <Route element={<AuthLayout />}>
              <Route path="/signup" element={<Signup />} />
              <Route path="/login" element={<Login />} />
              <Route
                path="/health-context"
                element={
                  <PrivateRoute>
                    <HealthContext />
                  </PrivateRoute>
                }
              />
            </Route>
          </Routes>
        </AuthProvider>
      </Router>
    </>
  );
}

export default App;
