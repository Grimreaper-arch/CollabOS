import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Spinner } from "./ui";

// Only renders child routes for logged-in users.
export default function ProtectedRoute() {
    const { user, loading } = useAuth();
    const location = useLocation();

    if (loading) return <Spinner full />;
    if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
    return <Outlet />;
}

// The app pages need an organization. Users without one go to the welcome screen.
export function RequireOrg() {
    const { organization } = useAuth();
    return organization ? <Outlet /> : <Navigate to="/welcome" replace />;
}

// The welcome screen is only for users who don't have an organization yet.
export function RequireNoOrg() {
    const { organization } = useAuth();
    return organization ? <Navigate to="/dashboard" replace /> : <Outlet />;
}

// For login/signup: logged-in users go straight in.
export function GuestRoute() {
    const { user, loading } = useAuth();
    if (loading) return <Spinner full />;
    return user ? <Navigate to="/dashboard" replace /> : <Outlet />;
}
