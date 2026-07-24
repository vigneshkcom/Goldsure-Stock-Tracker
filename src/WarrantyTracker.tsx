import { useMemo, useState } from "react";
import { ArrowLeft, Check, Pencil, Search, Trash2, X } from "lucide-react";
import type { WarrantyJob, WarrantyJobStatus, WarrantyJobType } from "./types";
import { formatJobDateTime, statusCardClass, statusChipClass, statusLabels } from "./warranty";

export type TrackerRow = {
  job: WarrantyJob;
  posted: number;
  installed: number;
  faulty: number;
  postedProducts: string;
  installedProducts: string;
};

type SortKey = "created-desc" | "created-asc" | "updated-desc" | "job" | "status";

const sortOptions: { value: SortKey; label: string }[] = [
  { value: "created-desc", label: "Newest created" },
  { value: "created-asc", label: "Oldest created" },
  { value: "updated-desc", label: "Recent activity" },
  { value: "job", label: "Job number" },
  { value: "status", label: "Status" },
];

const statusRank: Record<WarrantyJobStatus, number> = { open: 0, posted: 1, completed: 2, cancelled: 3 };

export default function WarrantyTracker({
  rows,
  onBack,
  onChangeStatus,
  onSaveNotes,
  onDelete,
}: {
  rows: TrackerRow[];
  onBack: () => void;
  onChangeStatus: (id: string, status: WarrantyJobStatus) => void;
  onSaveNotes: (id: string, notes: string) => void;
  onDelete: (ids: string[]) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("created-desc");
  const [term, setTerm] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftNotes, setDraftNotes] = useState("");

  const visible = useMemo(() => {
    const needle = term.trim().toLowerCase();
    const filtered = needle
      ? rows.filter((row) =>
          [row.job.job_number, row.job.customer_name, row.job.customer_address, row.job.customer_phone, row.job.notes]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(needle),
        )
      : rows;
    const created = (row: TrackerRow) => row.job.created_at ?? "";
    const sorted = [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "created-asc":
          return created(a).localeCompare(created(b));
        case "updated-desc":
          return (b.job.updated_at ?? "").localeCompare(a.job.updated_at ?? "");
        case "job":
          return a.job.job_number.localeCompare(b.job.job_number, undefined, { numeric: true });
        case "status":
          return statusRank[a.job.status] - statusRank[b.job.status] || created(b).localeCompare(created(a));
        default:
          return created(b).localeCompare(created(a));
      }
    });
    return sorted;
  }, [rows, term, sortKey]);

  const allVisibleIds = visible.map((row) => row.job.id);
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => selected.includes(id));

  const toggle = (id: string) =>
    setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  const toggleAll = () => setSelected(allSelected ? [] : allVisibleIds);

  const startEdit = (job: WarrantyJob) => {
    setEditingId(job.id);
    setDraftNotes(job.notes ?? "");
  };
  const saveEdit = (id: string) => {
    onSaveNotes(id, draftNotes);
    setEditingId(null);
  };

  const deleteSelected = () => {
    onDelete(selected);
    setSelected([]);
  };

  return (
    <section className="tracker">
      <div className="tracker-bar">
        <button className="ghost-button" type="button" onClick={onBack}>
          <ArrowLeft size={18} />
          Back to Warranty
        </button>
        <div className="tracker-title">
          <span className="eyebrow">Warranty</span>
          <h1>Warranty Tracker</h1>
          <p className="muted">
            {rows.length} job{rows.length === 1 ? "" : "s"} total
          </p>
        </div>
        <div className="tracker-tools">
          <label className="search-box">
            <Search size={17} />
            <input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Search jobs" />
          </label>
          <label className="tracker-sort">
            Sort
            <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
              {sortOptions.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="tracker-actions">
        <label className="select-all">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} />
          {allSelected ? "Clear selection" : "Select all"}
        </label>
        {selected.length > 0 ? (
          <button className="danger-button" type="button" onClick={deleteSelected}>
            <Trash2 size={16} />
            Delete {selected.length} selected
          </button>
        ) : (
          <span className="muted tracker-hint">Tick jobs to bulk-delete. Change status or edit notes on any card.</span>
        )}
      </div>

      <div className="tracker-list">
        {visible.map((row) => {
          const job = row.job;
          const type: WarrantyJobType = job.job_type ?? "warranty";
          const isEditing = editingId === job.id;
          return (
            <article className={`tracker-card ${statusCardClass[job.status]} ${selected.includes(job.id) ? "picked" : ""}`} key={job.id}>
              <div className="tracker-card-top">
                <label className="pick">
                  <input type="checkbox" checked={selected.includes(job.id)} onChange={() => toggle(job.id)} />
                </label>
                <div className="tracker-card-head">
                  <strong>{job.job_number}</strong>
                  <span>{job.customer_name}</span>
                  <em className={`type-chip ${type === "oneoff" ? "info" : "neutral"} job-type-tag`}>
                    {type === "oneoff" ? "One-Off" : "Warranty"}
                  </em>
                </div>
                <select
                  className={`job-status-select status-chip ${statusChipClass[job.status]}`}
                  value={job.status}
                  aria-label={`Status for job ${job.job_number}`}
                  onChange={(event) => onChangeStatus(job.id, event.target.value as WarrantyJobStatus)}
                >
                  <option value="open">Open</option>
                  <option value="posted">Posted</option>
                  <option value="completed">Replaced</option>
                  <option value="cancelled">Closed</option>
                </select>
              </div>

              <div className="tracker-meta">
                <div>
                  <span>Created</span>
                  <strong>{formatJobDateTime(job.created_at)}</strong>
                </div>
                <div>
                  <span>Last action</span>
                  <strong>{formatJobDateTime(job.updated_at ?? job.created_at)}</strong>
                </div>
                <div>
                  <span>Status</span>
                  <strong>{statusLabels[job.status]}</strong>
                </div>
                <div>
                  <span>Movement</span>
                  <strong>
                    Posted {row.posted} · Installed {row.installed} · Faulty {row.faulty}
                  </strong>
                </div>
              </div>

              <div className="tracker-detail">
                <div>
                  <span>Address</span>
                  <strong>{job.customer_address || "Not entered"}</strong>
                </div>
                <div>
                  <span>Phone</span>
                  <strong>{job.customer_phone || "Not entered"}</strong>
                </div>
                <div>
                  <span>Posted to customer</span>
                  <strong>{row.postedProducts}</strong>
                </div>
                <div>
                  <span>Installed by electrician</span>
                  <strong>{row.installedProducts}</strong>
                </div>
              </div>

              <div className="tracker-notes">
                <div className="tracker-notes-head">
                  <span>Notes</span>
                  {isEditing ? (
                    <span className="tracker-notes-tools">
                      <button className="icon-text-button" type="button" onClick={() => saveEdit(job.id)}>
                        <Check size={15} /> Save
                      </button>
                      <button className="icon-text-button" type="button" onClick={() => setEditingId(null)}>
                        <X size={15} /> Cancel
                      </button>
                    </span>
                  ) : (
                    <button className="icon-text-button" type="button" onClick={() => startEdit(job)}>
                      <Pencil size={15} /> Edit
                    </button>
                  )}
                </div>
                {isEditing ? (
                  <textarea rows={3} value={draftNotes} onChange={(event) => setDraftNotes(event.target.value)} autoFocus />
                ) : (
                  <p className={job.notes ? "tracker-notes-body" : "tracker-notes-body empty"}>
                    {job.notes || "No notes yet."}
                  </p>
                )}
              </div>

              <div className="tracker-card-actions">
                <button className="danger-button ghost" type="button" onClick={() => onDelete([job.id])}>
                  <Trash2 size={15} />
                  Delete job
                </button>
              </div>
            </article>
          );
        })}
        {visible.length === 0 ? <p className="muted tracker-empty">No jobs match your search.</p> : null}
      </div>
    </section>
  );
}
