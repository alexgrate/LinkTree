import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { FolderPlus, LayoutGrid, Pencil, Plus, Trash2 } from "lucide-react";
import { del, get, patch, post } from "../api";
import { cx, useAction } from "../lib";
import { ICONS } from "../../lib/icons";
import AppIcon from "../../components/AppIcon";
import EnvBadge from "../../components/EnvBadge";
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  Modal,
  PageHeader,
  SearchInput,
  Select,
  Spinner,
  StatusBadge,
  Textarea,
  Toggle,
} from "../components/ui";

const ICON_NAMES = Object.keys(ICONS).sort();

export default function DirectoryPage() {
  const navigate = useNavigate();
  const [categoryId, setCategoryId] = useState(null);
  const [query, setQuery] = useState("");
  const [editingLink, setEditingLink] = useState(null); // {} for new
  const [editingCategory, setEditingCategory] = useState(null);
  const [deleting, setDeleting] = useState(null); // { kind, item }

  const categories = useQuery({ queryKey: ["categories"], queryFn: () => get("/console/categories/") });
  const links = useQuery({ queryKey: ["links"], queryFn: () => get("/console/links/") });

  const visible = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (links.data ?? []).filter((link) => {
      if (categoryId != null && link.category !== categoryId) return false;
      const text = [link.name, link.description, link.url, link.tags, link.ownerTeam, link.categoryName]
        .join(" ")
        .toLowerCase();
      return terms.every((term) => text.includes(term));
    });
  }, [links.data, categoryId, query]);

  const remove = useAction(
    ({ kind, item }) => del(`/console/${kind === "link" ? "links" : "categories"}/${item.id}/`),
    {
      invalidate: ["links", "categories", "overview"],
      success: (_, { item }) => `Deleted ${item.name}.`,
      onSuccess: (_, { kind, item }) => {
        setDeleting(null);
        if (kind === "category" && item.id === categoryId) setCategoryId(null);
      },
    }
  );
  const toggle = useAction((link) => patch(`/console/links/${link.id}/`, { isActive: !link.isActive }), {
    invalidate: ["links", "overview"],
    success: (link) => `${link.name} is now ${link.isActive ? "shown" : "hidden"}.`,
  });

  const loading = categories.isPending || links.isPending;
  const error = categories.error ?? links.error;
  const selectedCategory = categories.data?.find((c) => c.id === categoryId);

  return (
    <>
      <PageHeader
        title="Manage links"
        description="Categories and links shown on the Applications page. Changes appear there immediately."
        actions={
          <>
            <Button icon={LayoutGrid} onClick={() => navigate("/")}>
              View applications
            </Button>
            <Button icon={FolderPlus} onClick={() => setEditingCategory({})}>
              New category
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => setEditingLink({ category: categoryId })}>
              New link
            </Button>
          </>
        }
      />

      {loading ? (
        <Spinner />
      ) : error ? (
        <Card>
          <ErrorState error={error} onRetry={() => (categories.refetch(), links.refetch())} />
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[15rem_1fr]">
          <Card className="h-fit p-2">
            <h2 className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">Categories</h2>
            <ul>
              <li>
                <CategoryButton active={categoryId == null} onClick={() => setCategoryId(null)} name="All links"
                  count={links.data.length} />
              </li>
              {categories.data.map((category) => (
                <li key={category.id} className="group relative">
                  <CategoryButton
                    active={categoryId === category.id}
                    onClick={() => setCategoryId(category.id)}
                    name={category.name}
                    icon={category.icon}
                    count={category.linkCount}
                  />
                  <div className="absolute top-1/2 right-9 hidden -translate-y-1/2 group-focus-within:flex group-hover:flex">
                    <IconButton icon={Pencil} label={`Edit ${category.name}`} className="p-1"
                      onClick={() => setEditingCategory(category)} />
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4 dark:border-slate-800">
              <SearchInput value={query} onChange={setQuery} placeholder="Search links" className="min-w-48 flex-1" />
              {selectedCategory && (
                <Button size="sm" icon={Trash2} onClick={() => setDeleting({ kind: "category", item: selectedCategory })}>
                  Delete category
                </Button>
              )}
            </div>
            {visible.length === 0 ? (
              <EmptyState icon={LayoutGrid} title={links.data.length ? "No matching links" : "No links yet"}
                action={!links.data.length && (
                  <Button variant="primary" icon={Plus} onClick={() => setEditingLink({ category: categoryId })}>
                    Add the first link
                  </Button>
                )}>
                {!categories.data.length && "Create a category first, then add links to it."}
              </EmptyState>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {visible.map((link) => (
                  <li key={link.id} className={cx("flex items-center gap-4 px-4 py-3", !link.isActive && "opacity-60")}>
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                      <AppIcon name={link.icon} className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium text-slate-900 dark:text-white">{link.name}</span>
                        <EnvBadge environment={link.environment} label={link.environmentLabel} />
                        {!link.isActive && <StatusBadge active={false} off="Hidden" />}
                      </div>
                      <a href={link.url} target="_blank" rel="noopener noreferrer"
                        className="block truncate text-xs text-slate-500 hover:text-brand-600 hover:underline dark:text-slate-400">
                        {link.url}
                      </a>
                    </div>
                    <span className="hidden shrink-0 text-xs text-slate-500 md:block dark:text-slate-400">{link.categoryName}</span>
                    <div className="flex shrink-0">
                      <Toggle checked={link.isActive} onChange={() => toggle.mutate(link)} label={<span className="sr-only">Show {link.name}</span>} />
                      <IconButton icon={Pencil} label={`Edit ${link.name}`} className="ml-2" onClick={() => setEditingLink(link)} />
                      <IconButton icon={Trash2} label={`Delete ${link.name}`} className="hover:text-rose-600 dark:hover:text-rose-400"
                        onClick={() => setDeleting({ kind: "link", item: link })} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {editingLink && (
        <LinkModal link={editingLink} categories={categories.data ?? []} onClose={() => setEditingLink(null)} />
      )}
      {editingCategory && <CategoryModal category={editingCategory} onClose={() => setEditingCategory(null)} />}
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => remove.mutate(deleting)}
        pending={remove.isPending}
        title={`Delete ${deleting?.item.name}?`}
        confirmLabel="Delete"
      >
        {deleting?.kind === "category"
          ? "Only empty categories can be deleted. Move or delete its links first."
          : "It disappears from the app directory. To hide it temporarily, switch it off instead."}
      </ConfirmDialog>
    </>
  );
}

function CategoryButton({ active, onClick, name, icon, count }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        "flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium transition",
        active
          ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200"
          : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
      )}
    >
      {icon !== undefined ? <AppIcon name={icon} className="size-4 shrink-0" /> : <LayoutGrid className="size-4 shrink-0" />}
      <span className="flex-1 truncate">{name}</span>
      <span className="text-xs opacity-60 tabular-nums">{count}</span>
    </button>
  );
}

function IconSelect({ value, onChange, error }) {
  return (
    <div className="flex items-end gap-2">
      <span className="mb-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
        <AppIcon name={value} className="size-4" />
      </span>
      <Select label="Icon" value={value} onChange={(e) => onChange(e.target.value)} error={error} className="flex-1">
        <option value="">Default</option>
        {ICON_NAMES.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </Select>
    </div>
  );
}

function LinkModal({ link, categories, onClose }) {
  const isNew = !link.id;
  const [form, setForm] = useState({
    name: link.name ?? "",
    url: link.url ?? "",
    category: link.category ?? categories[0]?.id ?? "",
    description: link.description ?? "",
    icon: link.icon ?? "",
    environment: link.environment ?? "PROD",
    ownerTeam: link.ownerTeam ?? "",
    supportContact: link.supportContact ?? "",
    tags: link.tags ?? "",
    isActive: link.isActive ?? true,
    order: link.order ?? 0,
  });
  const save = useAction(
    () => (isNew ? post("/console/links/", form) : patch(`/console/links/${link.id}/`, form)),
    {
      invalidate: ["links", "categories", "overview"],
      success: (data) => (isNew ? `Added ${data.name}.` : `Saved ${data.name}.`),
      onSuccess: onClose,
    }
  );
  const errors = save.error?.fields ?? {};
  const set = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? "New link" : `Edit ${link.name}`}
      size="lg"
      onSubmit={() => save.mutate()}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={save.isPending}>
            {isNew ? "Add link" : "Save"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Name" value={form.name} onChange={set("name")} error={errors.name} required autoFocus />
        <Select label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: Number(e.target.value) })}
          error={errors.category}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>
      <Input label="URL" value={form.url} onChange={set("url")} error={errors.url} required
        placeholder="https://… or http://servername:port" hint="Bare intranet names such as http://corebank:8080 are fine." />
      <Textarea label="Description" rows={2} value={form.description} onChange={set("description")} error={errors.description} />
      <div className="grid gap-4 sm:grid-cols-2">
        <IconSelect value={form.icon} onChange={(icon) => setForm({ ...form, icon })} error={errors.icon} />
        <Select label="Environment" value={form.environment} onChange={set("environment")}>
          <option value="PROD">Production</option>
          <option value="UAT">UAT</option>
          <option value="DR">Disaster Recovery</option>
        </Select>
        <Input label="Owner team" value={form.ownerTeam} onChange={set("ownerTeam")} error={errors.ownerTeam} />
        <Input label="Support contact" value={form.supportContact} onChange={set("supportContact")}
          error={errors.supportContact} placeholder="email or ext. 1234" />
      </div>
      <Input label="Search aliases" value={form.tags} onChange={set("tags")} error={errors.tags}
        hint="Comma-separated nicknames people search for, e.g. cbs, core, teller." />
      <div className="grid items-end gap-4 sm:grid-cols-2">
        <Input label="Order" type="number" min="0" value={form.order} error={errors.order}
          onChange={(e) => setForm({ ...form, order: Number(e.target.value) })} hint="Lower numbers appear first." />
        <Toggle checked={form.isActive} onChange={(isActive) => setForm({ ...form, isActive })}
          label="Show on the directory" description="Switch off to hide without deleting." />
      </div>
    </Modal>
  );
}

function CategoryModal({ category, onClose }) {
  const isNew = !category.id;
  const [form, setForm] = useState({ name: category.name ?? "", icon: category.icon ?? "", order: category.order ?? 0 });
  const save = useAction(
    () => (isNew ? post("/console/categories/", form) : patch(`/console/categories/${category.id}/`, form)),
    {
      invalidate: ["categories", "links", "overview"],
      success: (data) => (isNew ? `Created ${data.name}.` : `Saved ${data.name}.`),
      onSuccess: onClose,
    }
  );
  const errors = save.error?.fields ?? {};

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? "New category" : `Edit ${category.name}`}
      size="sm"
      onSubmit={() => save.mutate()}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={save.isPending}>
            {isNew ? "Create" : "Save"}
          </Button>
        </>
      }
    >
      <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={errors.name} required autoFocus />
      <IconSelect value={form.icon} onChange={(icon) => setForm({ ...form, icon })} error={errors.icon} />
      <Input label="Order" type="number" min="0" value={form.order} error={errors.order}
        onChange={(e) => setForm({ ...form, order: Number(e.target.value) })} hint="Lower numbers appear first." />
    </Modal>
  );
}
