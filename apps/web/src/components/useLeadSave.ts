import { useEffect, useState } from "react";
import type { PipelineLead } from "@crm/contracts";
import { CrmError, createLead, getLead } from "../api/crm";
import { errorText } from "../api/errors";

/**
 * Save-as-lead state for one property, shared by the drawer and the map popup:
 * a read-only GET marks an existing lead up front, 201 shows the toast, 409 marks it known.
 */
export function useLeadSave(apn: string | null) {
  const [known, setKnown] = useState<ReadonlySet<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const markKnown = (a: string) => setKnown((k) => new Set([...k, a]));

  useEffect(() => {
    if (!apn) return;
    let cancelled = false;
    getLead(apn).then(
      (lead) => {
        if (!cancelled && lead) setKnown((k) => new Set([...k, lead.apn]));
      },
      () => undefined, // a failed lookup leaves the button enabled; a save still gets 409
    );
    return () => {
      cancelled = true;
    };
  }, [apn]);

  /** Saves the snapshot; refuses one without finite coordinates. */
  const save = (lead: PipelineLead | null) => {
    if (!lead || !Number.isFinite(lead.lat) || !Number.isFinite(lead.lon)) return;
    const target = lead.apn;
    setSaving(true);
    setError(null);
    createLead({ apn: target, snapshot: lead }).then(
      () => {
        markKnown(target);
        setSaved(true);
        setSaving(false);
      },
      (e: unknown) => {
        setSaving(false);
        if (e instanceof CrmError && e.status === 409) markKnown(target);
        else setError(errorText(e, "Failed to save lead"));
      },
    );
  };

  return {
    isKnown: (a: string) => known.has(a),
    saving,
    saved,
    clearSaved: () => setSaved(false),
    error,
    save,
  };
}
