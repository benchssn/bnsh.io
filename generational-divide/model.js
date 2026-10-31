export const valueAt = (data, id, year) => {
  const value = data.observations[id]?.[year];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
};
export function selectRows(data, { year, region = '', search = '', sort = 'high' }) {
  return data.countries.filter(c => (!region || c.region === region) && c.name.toLowerCase().includes(search.toLowerCase().trim()))
    .map(c => ({ ...c, value: valueAt(data, c.id, year) }))
    .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) :
      a.value === null ? (b.value === null ? a.name.localeCompare(b.name) : 1) :
      b.value === null ? -1 : (sort === 'low' ? a.value - b.value : b.value - a.value) || a.name.localeCompare(b.name));
}
export const csvCell = value => '"' + String(value ?? '').replaceAll('"', '""') + '"';
