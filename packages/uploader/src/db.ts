// IndexedDB Storage Engine for Offline Queue Resilience
import { UploadTask } from '@camkit/types';

const DB_NAME = 'CamKitOfflineQueue';
const DB_VERSION = 1;
const STORE_NAME = 'tasks';

export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(new Error('IndexedDB open error'));
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

// Map task to a format safe for IndexedDB (must handle File/Blob correctly)
interface SerializedTask {
  id: string;
  file: Blob | File;
  metadata: any;
  status: string;
  progress: number;
  retries: number;
  error?: string;
}

export async function saveTaskToDB(task: UploadTask): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const serialized: SerializedTask = {
      id: task.id,
      file: task.file,
      metadata: task.metadata,
      status: task.status,
      progress: task.progress,
      retries: task.retries,
      error: task.error,
    };

    const request = store.put(serialized);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(tx.error || new Error('Put task error'));
  });
}

export async function removeTaskFromDB(id: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(tx.error || new Error('Delete task error'));
  });
}

export async function loadTasksFromDB(): Promise<UploadTask[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const items = request.result as SerializedTask[];
      const tasks: UploadTask[] = items.map((item) => ({
        id: item.id,
        file: item.file,
        metadata: item.metadata,
        status: item.status as any,
        progress: item.progress,
        retries: item.retries,
        error: item.error,
      }));
      resolve(tasks);
    };
    request.onerror = () => reject(tx.error || new Error('GetAll tasks error'));
  });
}
