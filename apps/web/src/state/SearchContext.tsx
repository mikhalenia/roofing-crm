import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from "react";
import { initialState, searchReducer, type SearchAction, type SearchState } from "./search";

interface Ctx {
  state: SearchState;
  dispatch: Dispatch<SearchAction>;
}

const SearchContext = createContext<Ctx | null>(null);

export function SearchProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(searchReducer, initialState);
  return <SearchContext.Provider value={{ state, dispatch }}>{children}</SearchContext.Provider>;
}

export function useSearch(): Ctx {
  const ctx = useContext(SearchContext);
  if (!ctx) throw new Error("useSearch must be used within SearchProvider");
  return ctx;
}
