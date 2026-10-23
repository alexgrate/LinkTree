import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import { Plus, Trash2, UserPlus, UsersRound, X } from "lucide-react";
import { del, get, patch, post } from "../api";
import { formatDate, useAction, useDebounced } from "../lib";
import {
  Avatar,
  Button,
  Card,
  ConfirmDialog,
  Drawer,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  Modal,
  PageHeader,
  Pagination,
  SearchInput,
  Spinner,
  Textarea,
} from "../components/ui";
import GranteePicker from "../components/GranteePicker";

const PAGE_SIZE = 25;

export default function GroupsPage() {
  const [params, setParams] = useSearchParams();
  const selected = params.get("group");
  const [query, setQuery] = useState("");
  const [start, setStart] = useState(1);
  const [creating, setCreating] = useState(false);
  const q = useDebounced(query.trim());

  const groups = useQuery({
    queryKey: ["groups", q, start],
    queryFn: () => get("/console/groups/", { q, start, count: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  const select = (id) => setParams(id ? { group: id } : {});

  return (
    <>
      <PageHeader
        title="Groups"
        description="Grant application access and admin roles to groups rather than individuals."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
            New group
          </Button>
        }
      />
      <Card>
        <div className="border-b border-slate-100 p-4 dark:border-slate-800">
          <SearchInput
            value={query}
            onChange={(value) => {
              setQuery(value);
              setStart(1);
            }}
            placeholder="Search groups"
          />
        </div>
        {groups.isPending ? (
          <Spinner />
        ) : groups.isError ? (
          <ErrorState error={groups.error} onRetry={groups.refetch} />
        ) : groups.data.items.length === 0 ? (
          <EmptyState icon={UsersRound} title="No groups found">
            {q ? `Nothing matches “${q}”.` : "Create a group to manage access for a team at once."}
          </EmptyState>
        ) : (
          <>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {groups.data.items.map((group) => (
                <li key={group.id}>
                  <button
                    type="button"
                    onClick={() => select(group.id)}
                    className="flex w-full items-center gap-4 px-4 py-3.5 text-left transition hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none dark:hover:bg-slate-800/50 dark:focus-visible:bg-slate-800/50"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                      <UsersRound className="size-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-slate-900 dark:text-white">{group.displayName}</span>
                      <span className="block truncate text-sm text-slate-500 dark:text-slate-400">
                        {group.description || "No description"}
                      </span>
                    </span>
                    {group.memberCount != null && (
                      <span className="shrink-0 text-sm text-slate-500 tabular-nums dark:text-slate-400">
                        {group.memberCount} {group.memberCount === 1 ? "member" : "members"}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
            <Pagination start={start} count={PAGE_SIZE} total={groups.data.total} onChange={setStart} />
          </>
        )}
      </Card>

      <GroupFormModal open={creating} onClose={() => setCreating(false)} onSaved={(group) => select(group.id)} />
      <GroupDrawer groupId={selected} onClose={() => select(null)} />
    </>
  );
}

function GroupFormModal({ open, onClose, onSaved, group }) {
  const [form, setForm] = useState({ displayName: group?.displayName ?? "", description: group?.description ?? "" });
  const save = useAction(
    (data) => (group ? patch(`/console/groups/${group.id}/`, data) : post("/console/groups/", data)),
    {
      invalidate: ["groups", "overview"],
      success: (data) => (group ? "Group saved." : `Created ${data.displayName}.`),
      onSuccess: (data) => {
        close();
        onSaved?.(data);
      },
    }
  );
  const errors = save.error?.fields ?? {};

  function close() {
    if (!group) setForm({ displayName: "", description: "" });
    save.reset();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={group ? "Edit group" : "New group"}
      onSubmit={() => save.mutate(form)}
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button type="submit" variant="primary" loading={save.isPending}>
            {group ? "Save" : "Create group"}
          </Button>
        </>
      }
    >
      <Input label="Name" value={form.displayName} error={errors.displayName} autoFocus required
        onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
      <Textarea label="Description" value={form.description} error={errors.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })} />
    </Modal>
  );
}

function GroupDrawer({ groupId, onClose }) {
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const group = useQuery({
    queryKey: ["groups", "detail", groupId],
    queryFn: () => get(`/console/groups/${groupId}/`),
    enabled: Boolean(groupId),
  });
  const g = group.data;

  const addMember = useAction(({ id }) => post(`/console/groups/${groupId}/members/`, { userIds: [id] }), {
    invalidate: ["groups", "users"],
    success: (_, user) => `Added ${user.display}.`,
  });
  const removeMember = useAction((member) => del(`/console/groups/${groupId}/members/${member.id}/`), {
    invalidate: ["groups", "users"],
    success: (_, member) => `Removed ${member.displayName}.`,
  });
  const remove = useAction(() => del(`/console/groups/${groupId}/`), {
    invalidate: ["groups", "admin-roles", "overview"],
    success: () => `Deleted ${g.displayName}.`,
    onSuccess: () => {
      setDeleting(false);
      onClose();
    },
  });

  return (
    <Drawer
      open={Boolean(groupId)}
      onClose={onClose}
      title={
        <div>
          <h2 className="truncate text-lg font-semibold">{g?.displayName ?? "Group"}</h2>
          {g?.description && <p className="text-sm text-slate-500 dark:text-slate-400">{g.description}</p>}
        </div>
      }
      subtitle={g && <span className="text-xs text-slate-500 dark:text-slate-400">Created {formatDate(g.createdAt)}</span>}
      actions={
        g && (
          <>
            <Button size="sm" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <IconButton icon={Trash2} label="Delete group" onClick={() => setDeleting(true)}
              className="hover:text-rose-600 dark:hover:text-rose-400" />
          </>
        )
      }
    >
      {group.isPending ? (
        <Spinner />
      ) : group.isError ? (
        <ErrorState error={group.error} onRetry={group.refetch} />
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">
              Members <span className="font-normal text-slate-400">{g.members.length}</span>
            </h3>
            <Button size="sm" icon={UserPlus} onClick={() => setPicking(true)}>
              Add members
            </Button>
          </div>
          {g.members.length === 0 ? (
            <EmptyState icon={UsersRound} title="No members yet" />
          ) : (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {g.members.map((member) => (
                <li key={member.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Avatar name={member.displayName} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{member.displayName}</div>
                    {member.userName && (
                      <div className="truncate text-xs text-slate-500 dark:text-slate-400">{member.userName}</div>
                    )}
                  </div>
                  <IconButton icon={X} label={`Remove ${member.displayName}`} disabled={removeMember.isPending}
                    onClick={() => removeMember.mutate(member)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {g && (
        <>
          <GroupFormModal key={`${g.id}-${editing}`} open={editing} onClose={() => setEditing(false)} group={g} />
          <GranteePicker
            open={picking}
            onClose={() => setPicking(false)}
            title={`Add members to ${g.displayName}`}
            types={["User"]}
            assigned={new Set(g.members.map((m) => `User:${m.id}`))}
            onPick={(user) => addMember.mutateAsync(user)}
          />
          <ConfirmDialog
            open={deleting}
            onClose={() => setDeleting(false)}
            onConfirm={() => remove.mutate()}
            pending={remove.isPending}
            title={`Delete ${g.displayName}?`}
            confirmLabel="Delete group"
          >
            Members lose any application access and admin roles they got through this group. The users themselves
            aren't deleted.
          </ConfirmDialog>
        </>
      )}
    </Drawer>
  );
}
