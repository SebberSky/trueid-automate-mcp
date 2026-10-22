const REQUIRED_DIMENSIONS = ["functions", "targets", "inputs", "outputs", "support"];
function normalized(value) {
  if (Array.isArray(value)) return value.map(normalized).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(k=>[k,normalized(value[k])]));
  return typeof value === "string" ? value.trim() : value;
}
export function equivalentContracts(left, right) {
  if (!left || !right) return false;
  return REQUIRED_DIMENSIONS.every(d => Array.isArray(left[d]) && left[d].length > 0 && Array.isArray(right[d]) && right[d].length > 0 &&
    JSON.stringify(normalized(left[d])) === JSON.stringify(normalized(right[d])));
}
export function exactDuplicateMap(tools, review) {
  const known = new Set(tools.map(t=>t.system+":"+t.name));
  const duplicate = new Map();
  const occupied = new Set();
  for (const group of review.exactGroups || []) {
    if (group.verdict !== "exact" || group.reviewed !== true || !Array.isArray(group.members) || group.members.length < 2 ||
      new Set(group.members).size !== group.members.length || !group.members.includes(group.representative) ||
      !Array.isArray(group.evidence) || group.evidence.length < 2 ||
      !REQUIRED_DIMENSIONS.every(d => (group.verifiedDimensions || []).includes(d))) continue;
    if (group.members.some(k=>!known.has(k)||occupied.has(k))) continue;
    const canonical = review.profiles[group.representative]?.contract;
    if (!group.members.every(k=>equivalentContracts(canonical,review.profiles[k]?.contract))) continue;
    for (const k of group.members) {
      occupied.add(k);
      if (k !== group.representative) duplicate.set(k,group.representative);
    }
  }
  return duplicate;
}
export function reviewTools(tools, review, mode = "kept") {
  const aliases = exactDuplicateMap(tools,review);
  return tools.filter(t=>{
    const k=t.system+":"+t.name;
    if (mode === "all") return true;
    if (mode === "exact") return aliases.has(k);
    if (mode === "partial" || mode === "uncertain" || mode === "distinct") return !aliases.has(k) && review.profiles[k]?.status === mode;
    return !aliases.has(k);
  });
}
export function reviewSummary(tools, review) {
  const hidden=exactDuplicateMap(tools,review).size;
  return { total: tools.length, retained: tools.length-hidden, removed: hidden,
    partial: reviewTools(tools,review,"partial").length,
    uncertain: reviewTools(tools,review,"uncertain").length,
    distinct: reviewTools(tools,review,"distinct").length,
    groups:review.groups.length };
}

