import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { AgentResponse, PipelineLead } from "@crm/contracts";
import { askAgent } from "../api/crm";
import { errorText } from "../api/errors";

/** The property the question is about ("Ask agent" on the map). */
export interface AgentTarget {
  apn: string;
  address?: string | undefined;
}

export interface AgentState {
  open: boolean;
  question: string;
  target: AgentTarget | null;
  loading: boolean;
  error: string | null;
  result: AgentResponse | null;
  /** The target of the question that produced `result`; its sources are highlighted. */
  answeredTarget: AgentTarget | null;
}

interface Ctx {
  agent: AgentState;
  setOpen: (open: boolean) => void;
  setQuestion: (q: string, target?: AgentTarget | null) => void;
  askAbout: (lead: Pick<PipelineLead, "apn" | "situsAddress">) => void;
  send: (map: { lat: number; lon: number; radiusMiles: number }) => void;
}

export const askAboutQuestion = (l: Pick<PipelineLead, "apn" | "situsAddress">) =>
  `Tell me about ${l.situsAddress ?? l.apn} (APN ${l.apn}): roof age, permits, contractor, and whether it is a good roofing lead`;

const initial: AgentState = {
  open: false,
  question: "",
  target: null,
  loading: false,
  error: null,
  result: null,
  answeredTarget: null,
};

const AgentContext = createContext<Ctx | null>(null);

/** Agent panel state lives above the routes so a collapsed or re-mounted panel keeps its answer. */
export function AgentProvider({ children }: { children: ReactNode }) {
  const [agent, setAgent] = useState<AgentState>(initial);
  const requestId = useRef(0);

  const setOpen = useCallback((open: boolean) => setAgent((a) => ({ ...a, open })), []);
  const setQuestion = useCallback(
    (question: string, target?: AgentTarget | null) =>
      setAgent((a) => ({ ...a, question, ...(target !== undefined && { target }) })),
    [],
  );
  const askAbout = useCallback((l: Pick<PipelineLead, "apn" | "situsAddress">) => {
    const target: AgentTarget = { apn: l.apn, ...(l.situsAddress ? { address: l.situsAddress } : {}) };
    setAgent((a) => ({ ...a, open: true, question: askAboutQuestion(l), target }));
  }, []);

  const send = useCallback(
    (map: { lat: number; lon: number; radiusMiles: number }) => {
      const id = ++requestId.current;
      const { question, target } = agent;
      setAgent((a) => ({ ...a, loading: true, error: null }));
      askAgent({
        question: question.trim(),
        context: { ...map, ...(target && { apn: target.apn, ...(target.address && { address: target.address }) }) },
      }).then(
        (result) => {
          if (id === requestId.current)
            setAgent((a) => ({ ...a, loading: false, result, answeredTarget: target }));
        },
        (e: unknown) => {
          if (id === requestId.current) setAgent((a) => ({ ...a, loading: false, error: errorText(e) }));
        },
      );
    },
    [agent],
  );

  const value = useMemo(() => ({ agent, setOpen, setQuestion, askAbout, send }), [agent, setOpen, setQuestion, askAbout, send]);
  return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>;
}

export function useAgent(): Ctx {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error("useAgent must be used within AgentProvider");
  return ctx;
}
