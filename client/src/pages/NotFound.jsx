import { Link } from "react-router-dom";

export default function NotFound() {
    return (
        <div className="dot-bg flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
            <p className="bg-primary bg-clip-text tabular-nums text-8xl font-semibold tracking-tighter text-transparent">404</p>
            <p className="text-lg font-medium text-white">This page wandered off.</p>
            <p className="text-[15px] text-muted">The link may be broken, or the page may have been removed.</p>
            <Link to="/" className="btn-primary mt-2">Take me home</Link>
        </div>
    );
}
