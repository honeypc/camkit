// Upload Queue Orchestrator with Concurrency, Retry, Offline DB, and Abort Handles
import { UploaderConfig, UploadTask, UploadMetadata } from '@camkit/types';
import { saveTaskToDB, removeTaskFromDB, loadTasksFromDB } from './db';

export class UploadQueue {
  private config: Required<UploaderConfig>;
  private tasks: Map<string, UploadTask> = new Map();
  private abortControllers: Map<string, AbortController> = new Map();
  private activeUploadsCount = 0;

  constructor(config: UploaderConfig) {
    this.config = {
      uploadAdapter: config.uploadAdapter,
      concurrentLimit: config.concurrentLimit ?? 2,
      maxRetries: config.maxRetries ?? 3,
      retryDelayMs: config.retryDelayMs ?? 1000,
      offlineQueueEnabled: config.offlineQueueEnabled ?? true,
      allowedMimeTypes: config.allowedMimeTypes ?? [],
      maxFileSize: config.maxFileSize ?? Infinity,
      maxQueueSize: config.maxQueueSize ?? Infinity,
      onQueueChange: config.onQueueChange ?? (() => {}),
      onTaskProgress: config.onTaskProgress ?? (() => {}),
      onTaskSuccess: config.onTaskSuccess ?? (() => {}),
      onTaskFailed: config.onTaskFailed ?? (() => {}),
    };

    // Load offline items if enabled
    if (this.config.offlineQueueEnabled) {
      this.initOfflineQueue();
      // Listen to connectivity events
      if (typeof window !== 'undefined') {
        window.addEventListener('online', () => this.processQueue());
      }
    }
  }

  private async initOfflineQueue() {
    try {
      const offlineTasks = await loadTasksFromDB();
      offlineTasks.forEach((task) => {
        // Queue failed or pending items to retry when starting
        if (task.status === 'uploading' || task.status === 'queue') {
          task.status = 'queue';
          task.progress = 0;
        }
        this.tasks.set(task.id, task);
      });
      this.triggerQueueChange();
      this.processQueue();
    } catch (e) {
      console.warn('Failed to load offline queue from IndexedDB', e);
    }
  }

  public async add(file: Blob | File, customMetadata?: Record<string, any>): Promise<string> {
    // 1. Allowed MIME Types validation
    const mime = file.type || 'image/jpeg';
    if (this.config.allowedMimeTypes.length > 0 && !this.config.allowedMimeTypes.includes(mime)) {
      throw new Error(`File format "${mime}" is not allowed. Supported formats: ${this.config.allowedMimeTypes.join(', ')}`);
    }

    // 2. File Size limit validation
    if (file.size > this.config.maxFileSize) {
      const sizeMB = (file.size / 1024 / 1024).toFixed(2);
      const limitMB = (this.config.maxFileSize / 1024 / 1024).toFixed(2);
      throw new Error(`File size (${sizeMB} MB) exceeds maximum allowed limit of ${limitMB} MB.`);
    }

    // 3. Queue Size limit validation
    const activeTasks = Array.from(this.tasks.values()).filter(
      (t) => t.status === 'queue' || t.status === 'uploading'
    );
    if (activeTasks.length >= this.config.maxQueueSize) {
      throw new Error(`Upload queue limit exceeded. Maximum allowed files in queue is ${this.config.maxQueueSize}.`);
    }

    const id = `upload-${Math.random().toString(36).substring(2, 11)}`;
    const metadata: UploadMetadata = {
      id,
      filename: (file as File).name || `${id}.jpg`,
      createdAt: Date.now(),
      size: file.size,
      mimeType: file.type || 'image/jpeg',
      customData: customMetadata,
    };

    const task: UploadTask = {
      id,
      file,
      metadata,
      status: 'queue',
      progress: 0,
      retries: 0,
    };

    this.tasks.set(id, task);

    if (this.config.offlineQueueEnabled) {
      await saveTaskToDB(task);
    }

    this.triggerQueueChange();
    this.processQueue();
    return id;
  }

  /**
   * Aborts a running or pending upload task.
   */
  public abort(id: string) {
    const task = this.tasks.get(id);
    if (!task) return;

    if (task.status === 'uploading') {
      const controller = this.abortControllers.get(id);
      if (controller) {
        controller.abort();
      }
      this.abortControllers.delete(id);
    }

    task.status = 'aborted';
    this.triggerQueueChange();
    this.processQueue();
  }

  /**
   * Clears a completed or failed task from the queue and storage.
   */
  public async remove(id: string) {
    this.abort(id);
    this.tasks.delete(id);
    if (this.config.offlineQueueEnabled) {
      await removeTaskFromDB(id);
    }
    this.triggerQueueChange();
  }

  public getTasks(): UploadTask[] {
    return Array.from(this.tasks.values());
  }

  private triggerQueueChange() {
    this.config.onQueueChange(this.getTasks());
  }

  /**
   * Processes pending tasks, adhering to concurrency limits and network state.
   */
  private async processQueue() {
    // If offline, do not process
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return;
    }

    if (this.activeUploadsCount >= this.config.concurrentLimit) {
      return;
    }

    const pending = this.getTasks().find((t) => t.status === 'queue');
    if (!pending) return;

    this.activeUploadsCount++;
    await this.uploadTask(pending);
    this.activeUploadsCount--;

    // Recurse to handle subsequent queue entries
    this.processQueue();
  }

  private async uploadTask(task: UploadTask) {
    task.status = 'uploading';
    task.progress = 0;
    this.triggerQueueChange();

    const controller = new AbortController();
    this.abortControllers.set(task.id, controller);

    try {
      if (this.config.offlineQueueEnabled) {
        await saveTaskToDB(task);
      }

      // Execute adapter
      const response = await this.config.uploadAdapter(
        task,
        (percent) => {
          task.progress = percent;
          this.config.onTaskProgress(task.id, percent);
          this.triggerQueueChange();
        },
        controller.signal
      );

      // Succeeded
      task.status = 'completed';
      task.progress = 100;
      this.abortControllers.delete(task.id);
      this.config.onTaskSuccess(task.id, response);

      if (this.config.offlineQueueEnabled) {
        // Clean up from IndexedDB since it has finished uploading successfully
        await removeTaskFromDB(task.id);
      }

      this.triggerQueueChange();
    } catch (error: any) {
      this.abortControllers.delete(task.id);

      if (controller.signal.aborted || (task.status as string) === 'aborted') {
        task.status = 'aborted';
        task.error = 'Upload aborted by user';
        if (this.config.offlineQueueEnabled) {
          await saveTaskToDB(task);
        }
        this.triggerQueueChange();
        return;
      }

      // Retry logic (Exponential Backoff)
      if (task.retries < this.config.maxRetries) {
        task.retries++;
        task.status = 'queue';
        task.error = `Error: ${error.message}. Retrying... (${task.retries}/${this.config.maxRetries})`;
        if (this.config.offlineQueueEnabled) {
          await saveTaskToDB(task);
        }
        this.triggerQueueChange();

        const delay = Math.pow(2, task.retries) * this.config.retryDelayMs;
        setTimeout(() => this.processQueue(), delay);
      } else {
        // Permanently failed
        task.status = 'failed';
        task.error = error.message || 'Upload failed';
        if (this.config.offlineQueueEnabled) {
          await saveTaskToDB(task);
        }
        this.config.onTaskFailed(task.id, error);
        this.triggerQueueChange();
      }
    }
  }
}
