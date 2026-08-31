export function toJsonApi(
    input: Record<string, unknown> | undefined | null
): Record<string, unknown> {
    if (!input) return {};

    const { search, page, size, sort, order, ...rest } = input as Record<string, unknown>;
    const out: Record<string, unknown> = {};

    for (const [k, v] of Object.entries(rest)) {
        if (v == null || v === '') continue;
        const alreadyJsonApi = k.startsWith('filter[') || k.startsWith('page[') || k === 'include' || k === 'fields';
        out[alreadyJsonApi ? k : `filter[${k}]`] = v;
    }

    if (search != null && search !== '') out['search'] = search;

    if (sort != null && sort !== '') {
        out['sort'] = order === 'desc' ? `-${String(sort)}` : String(sort);
    }

    if (page != null) {
        out['page[number]'] = Number(page) + 1;
        out['page[size]'] = size ?? 15;
    }

    return out;
}
