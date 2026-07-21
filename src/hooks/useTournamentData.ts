import { useEffect, useState } from "react";
import { loadTournamentData } from "../data/loadData";
import type { TournamentData } from "../data/types";

interface State {
  data: TournamentData | null;
  loading: boolean;
  error: string | null;
}

export function useTournamentData(): State {
  const [state, setState] = useState<State>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    loadTournamentData()
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((err) => {
        if (!cancelled)
          setState({ data: null, loading: false, error: String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
