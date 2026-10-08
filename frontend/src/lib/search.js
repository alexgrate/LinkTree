// Every word in the query must appear somewhere in the app's searchable text,
// so "core prod" finds production core-banking apps.
function matches(app, category, terms) {
  if (terms.length === 0) return true;
  const haystack = [
    app.name,
    app.description,
    app.owner_team,
    app.support_contact,
    app.environment,
    app.environment_label,
    category.name,
    ...app.tags,
  ]
    .join(" ")
    .toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

export function filterCategories(categories, query, categoryId) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);

  return categories
    .filter((category) => categoryId == null || category.id === categoryId)
    .map((category) => ({
      ...category,
      links: category.links.filter((app) => matches(app, category, terms)),
    }))
    .filter((category) => category.links.length > 0);
}
