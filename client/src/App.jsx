import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import ProtectedRoute, { GuestRoute, RequireNoOrg, RequireOrg } from "./components/ProtectedRoute";
import AppLayout from "./components/AppLayout";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Welcome from "./pages/Welcome";
import Dashboard from "./pages/Dashboard";
import Calendar from "./pages/Calendar";
import Projects from "./pages/Projects";
import ProjectDetail from "./pages/ProjectDetail";
import Tasks from "./pages/Tasks";
import Code from "./pages/Code";
import Analytics from "./pages/Analytics";
import Messages from "./pages/Messages";
import Organization from "./pages/Organization";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

export default function App() {
    return (
        <ToastProvider>
            <AuthProvider>
                <BrowserRouter>
                    <Routes>
                        <Route path="/" element={<Landing />} />

                        {/* Only for visitors who are not logged in */}
                        <Route element={<GuestRoute />}>
                            <Route path="/login" element={<Login />} />
                            <Route path="/signup" element={<Signup />} />
                        </Route>

                        {/* Requires login */}
                        <Route element={<ProtectedRoute />}>
                            {/* Logged in but no organization yet: create one or accept an invite */}
                            <Route element={<RequireNoOrg />}>
                                <Route path="/welcome" element={<Welcome />} />
                            </Route>

                            {/* Logged in and part of an organization */}
                            <Route element={<RequireOrg />}>
                                <Route element={<AppLayout />}>
                                    <Route path="/dashboard" element={<Dashboard />} />
                                    <Route path="/calendar" element={<Calendar />} />
                                    <Route path="/projects" element={<Projects />} />
                                    <Route path="/projects/:id" element={<ProjectDetail />} />
                                    <Route path="/tasks" element={<Tasks />} />
                                    <Route path="/code" element={<Code />} />
                                    <Route path="/analytics" element={<Analytics />} />
                                    <Route path="/messages" element={<Messages />} />
                                    <Route path="/organization" element={<Organization />} />
                                    <Route path="/settings" element={<Settings />} />
                                </Route>
                            </Route>
                        </Route>

                        <Route path="*" element={<NotFound />} />
                    </Routes>
                </BrowserRouter>
            </AuthProvider>
        </ToastProvider>
    );
}
