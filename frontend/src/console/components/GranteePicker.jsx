import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Plus, Users } from "lucide-react";
import { get } from "../api";
import { useDebounced } from "../lib";
import { Avatar, Button, EmptyState, Modal, SearchInput, Spinner, Tabs } from "./ui";

// Search the identity domain for users (and optionally groups) and add them one at a time.
// `assigned` holds "User:<id>" / "Group:<id>" keys for who already has access.
export default function GranteePicker({ open, onClose, title, description, onPick, assigned, types = ["User", "Group"] }) {
  const [type, setType] = useState(types[0]);
  const [query, setQuery] = useState("");
  const q = useDebounced(query.trim());
  const [pendingId, setPendingId] = useState(null);

  const results = useQuery({
    queryKey: [type === "User" ? "users" : "groups", "picker", q],
    queryFn: () => get(type === "User" ? "/console/users/" : "/console/groups/", { q, count: 20, status: "active" }),
    enabled: open,
  });

  async function pick(item) {
    setPendingId(item.id);
    try {
      await onPick({ type, id: item.id, display: item.displayName });
    } finally {
      setPendingId(null);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={<Button onClick={onClose}>Done</Button>}
    >
      {types.length > 1 && (
        <Tabs
          tabs={types.map((t) => ({ id: t, label: t === "User" ? "Users" : "Groups" }))}
          active={type}
          onChange={setType}
        />
      )}
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder={type === "User" ? "Search by name, username or email" : "Search groups"}
      />
      {results.isPending ? (
        <Spinner />
      ) : results.data?.items.length ? (
        <ul className="-mx-2 divide-y divide-slate-100 dark:divide-slate-800">
          {results.data.items.map((item) => {
            const done = assigned?.has(`${type}:${item.id}`);
            return (
              <li key={item.id} className="flex items-center gap-3 px-2 py-2.5">
                {type === "User" ? (
                  <Avatar name={item.displayName} size="sm" />
                ) : (
                  <span className="grid size-7 place-items-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800">
                    <Users className="size-3.5" aria-hidden="true" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{item.displayName}</div>
                  <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {type === "User" ? item.email || item.userName : item.description}
                  </div>
                </div>
                {done ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    <Check className="size-3.5" aria-hidden="true" /> Added
                  </span>
                ) : (
                  <Button size="sm" icon={Plus} loading={pendingId === item.id} onClick={() => pick(item)}>
                    Add
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState title="No matches">Try a different name.</EmptyState>
      )}
    </Modal>
  );
}
