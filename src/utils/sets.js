/** Determine which complete tradable set contains a Prime component. */
export function findSetForItem(item, items=[]) {
  if (!item?.slug || item.nontradable || item.slug.endsWith('_set')) return null;
  const slug = item.slug;
  if (!slug.includes('_prime_')) return null;
  // A Prime component may have multiple suffix tokens. Use an exact set slug
  // that exists in the Market catalogue rather than guessing any name.
  const available = items.filter(x => x?.slug?.endsWith('_prime_set'));
  const candidates = available.filter(x =>
    slug.startsWith(x.slug.slice(0,-4) + '_')
  ).sort((a,b) => b.slug.length-a.slug.length);
  return candidates[0] || null;
}

/** Never recommend a partially valued selection; recommendation uses seller asks. */
export function recommendRewardSlot(rows=[]) {
  if (!Array.isArray(rows) || rows.length!==4) return null;
  for (const row of rows) {
    if (!row.item) return null;
    if (row.item.nontradable) continue;
    if (row.price?.error || row.price?.stale || row.price?.lowestSell == null) return null;
  }
  const tradable = rows.filter(r => !r.item.nontradable && Number.isFinite(r.price?.lowestSell));
  if (!tradable.length) return null;
  return tradable.reduce((best,row) => !best || row.price.lowestSell > best.price.lowestSell ? row : best, null)?.slot ?? null;
}
