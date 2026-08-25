export interface GetAllOptions<
    TParams extends Record<string, unknown> = Record<string, unknown>,
    TData = unknown
> {
    params?: TParams;
    data?: TData;
    url?: string;
}

export interface GetOneOptions<
    TParams extends Record<string, unknown> = Record<string, unknown>
> {
    id: string | number;
    params?: TParams;
    url?: string;
}

export interface CreateOptions<TData = unknown> {
    data: TData;
    url?: string;
}

export interface UpdateOptions<TData = unknown> {
    id: string | number;
    data: TData;
    url?: string;
}

export interface PatchOptions<TData = unknown> {
    id: string | number;
    data: Partial<TData>;
    url?: string;
}

export interface DeleteOptions {
    id: string | number;
    url?: string;
}

export interface BulkCreateOptions<TData = unknown> {
    data: TData[];
    url?: string;
}

export interface BulkUpdateOptions<TData = unknown> {
    data: TData[];
    url?: string;
}

export interface BulkDeleteOptions {
    ids: (string | number)[];
    url?: string;
}

export interface UpsertOptions<TData = unknown> {
    data: TData & { id?: string | number };
    url?: string;
}

export interface CustomRequestOptions<
    TParams extends Record<string, unknown> = Record<string, unknown>,
    TData = unknown
> {
    method: string;
    url: string;
    params?: TParams;
    data?: TData;
}
