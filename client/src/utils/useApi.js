import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client";

// Loads data from the API when the component mounts (and whenever `path` changes).
// Returns { data, error, loading, reload }. Pass null as path to skip loading.
export default function useApi(path) {
    const [state, setState] = useState({ data: null, error: "", loading: Boolean(path) });

    const reload = useCallback(async () => {
        if (!path) return;
        try {
            const data = await api(path);
            setState({ data, error: "", loading: false });
        } catch (error) {
            setState((prev) => ({ ...prev, error: error.message, loading: false }));
        }
    }, [path]);

    useEffect(() => {
        setState((prev) => ({ ...prev, loading: Boolean(path) }));
        reload();
    }, [reload, path]);

    return { ...state, reload };
}
