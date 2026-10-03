import type { ImportedSource } from "./types.ts";

export interface SourceRepository {
  save(source: ImportedSource): Promise<void>;
  listByProject(projectId: string): Promise<ImportedSource[]>;
  remove(sourceDocumentId: string): Promise<void>;
}

export class MemorySourceRepository implements SourceRepository {
  readonly #sources = new Map<string, ImportedSource>();

  async save(source: ImportedSource): Promise<void> {
    this.#sources.set(source.document.id, structuredClone(source));
  }

  async listByProject(projectId: string): Promise<ImportedSource[]> {
    return [...this.#sources.values()]
      .filter((source) => source.document.projectId === projectId)
      .sort((left, right) => right.document.importedAt.localeCompare(left.document.importedAt))
      .map((source) => structuredClone(source));
  }

  async remove(sourceDocumentId: string): Promise<void> {
    this.#sources.delete(sourceDocumentId);
  }
}

const STORE_NAME = "sources";

export class BrowserSourceRepository implements SourceRepository {
  readonly #databaseName: string;

  constructor(databaseName = "story-rewriter-v1") {
    this.#databaseName = databaseName;
  }

  async save(source: ImportedSource): Promise<void> {
    const database = await this.#open();
    try {
      await transactionPromise(database, "readwrite", (store) => store.put(source));
    } finally {
      database.close();
    }
  }

  async listByProject(projectId: string): Promise<ImportedSource[]> {
    const database = await this.#open();
    try {
      return await new Promise<ImportedSource[]>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readonly");
        const request = transaction.objectStore(STORE_NAME).index("projectId").getAll(projectId);
        request.onerror = () => reject(request.error ?? new Error("读取原文失败"));
        request.onsuccess = () => resolve((request.result as ImportedSource[]).sort((left, right) => right.document.importedAt.localeCompare(left.document.importedAt)));
      });
    } finally {
      database.close();
    }
  }

  async remove(sourceDocumentId: string): Promise<void> {
    const database = await this.#open();
    try {
      await transactionPromise(database, "readwrite", (store) => store.delete(sourceDocumentId));
    } finally {
      database.close();
    }
  }

  async #open(): Promise<IDBDatabase> {
    if (typeof indexedDB === "undefined") throw new Error("当前运行环境不支持本地原文库");
    return await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.#databaseName, 1);
      request.onerror = () => reject(request.error ?? new Error("无法打开本地原文库"));
      request.onupgradeneeded = () => {
        const database = request.result;
        const store = database.createObjectStore(STORE_NAME, { keyPath: "document.id" });
        store.createIndex("projectId", "document.projectId", { unique: false });
      };
      request.onsuccess = () => resolve(request.result);
    });
  }
}

function transactionPromise(
  database: IDBDatabase,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    operation(transaction.objectStore(STORE_NAME));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("本地原文库事务失败"));
    transaction.onabort = () => reject(transaction.error ?? new Error("本地原文库事务已中止"));
  });
}

