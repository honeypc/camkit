// Default Upload Adapters (Standard URL and AWS S3)
import { UploadAdapter } from '@camkit/types';

/**
 * Custom HTTP POST Multipart Form Adapter
 * Perfect for standard Node, Rails, Laravel, and other APIs.
 */
export function createHttpAdapter(options: {
  url: string;
  fieldName?: string;
  headers?: Record<string, string>;
}): UploadAdapter {
  return (task, onProgress, abortSignal) => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', options.url);

      // Add custom headers
      if (options.headers) {
        Object.entries(options.headers).forEach(([key, val]) => {
          xhr.setRequestHeader(key, val);
        });
      }

      // Track progress
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const res = JSON.parse(xhr.responseText);
            resolve(res);
          } catch (e) {
            resolve({ text: xhr.responseText });
          }
        } else {
          reject(new Error(`Upload failed with status code ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.onabort = () => reject(new Error('Upload aborted by user'));

      // Listen for abort signal
      abortSignal.addEventListener('abort', () => {
        xhr.abort();
      });

      // Prepare payload
      const formData = new FormData();
      formData.append(options.fieldName || 'file', task.file, task.metadata.filename);
      formData.append('metadata', JSON.stringify(task.metadata));

      xhr.send(formData);
    });
  };
}

/**
 * AWS S3 Presigned URL PUT Adapter
 * Directly uploads binary blob to AWS S3.
 */
export function createS3Adapter(options: {
  getPresignedUrl: (task: any) => Promise<string>;
  headers?: Record<string, string>;
}): UploadAdapter {
  return async (task, onProgress, abortSignal) => {
    const url = await options.getPresignedUrl(task);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);

      xhr.setRequestHeader('Content-Type', task.file.type || 'application/octet-stream');

      if (options.headers) {
        Object.entries(options.headers).forEach(([key, val]) => {
          xhr.setRequestHeader(key, val);
        });
      }

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200 || xhr.status === 201) {
          resolve({ success: true, url: url.split('?')[0] });
        } else {
          reject(new Error(`S3 upload failed with status code ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error('Network error during S3 upload'));
      xhr.onabort = () => reject(new Error('S3 Upload aborted by user'));

      abortSignal.addEventListener('abort', () => {
        xhr.abort();
      });

      xhr.send(task.file);
    });
  };
}

/**
 * Chunked Upload Helper Adapter
 * Slices the file and uploads chunk-by-chunk for large files and robust uploads.
 */
export function createChunkedAdapter(options: {
  url: string;
  chunkSize?: number; // bytes
  headers?: Record<string, string>;
}): UploadAdapter {
  const CHUNK_SIZE = options.chunkSize || 2 * 1024 * 1024; // 2MB default

  return async (task, onProgress, abortSignal) => {
    const file = task.file;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const uploadId = `${task.id}-${Date.now()}`;

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      if (abortSignal.aborted) {
        throw new Error('Upload aborted');
      }

      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);

      await new Promise<void>((resolveChunk, rejectChunk) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', options.url);

        if (options.headers) {
          Object.entries(options.headers).forEach(([key, val]) => {
            xhr.setRequestHeader(key, val);
          });
        }

        xhr.setRequestHeader('X-Upload-ID', uploadId);
        xhr.setRequestHeader('X-Chunk-Index', chunkIndex.toString());
        xhr.setRequestHeader('X-Total-Chunks', totalChunks.toString());
        xhr.setRequestHeader('X-Filename', task.metadata.filename);

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const chunkPercent = 100 / totalChunks;
            const overallPercent = Math.round((chunkIndex + 1) * chunkPercent);
            onProgress(Math.min(overallPercent, 100));
            resolveChunk();
          } else {
            rejectChunk(new Error(`Chunk ${chunkIndex} failed with status ${xhr.status}`));
          }
        };

        xhr.onerror = () => rejectChunk(new Error(`Network error on chunk ${chunkIndex}`));
        xhr.onabort = () => rejectChunk(new Error('Chunk upload aborted'));

        abortSignal.addEventListener('abort', () => {
          xhr.abort();
        }, { once: true });

        const formData = new FormData();
        formData.append('chunk', chunk, `${task.metadata.filename}.part_${chunkIndex}`);
        formData.append('uploadId', uploadId);
        formData.append('chunkIndex', chunkIndex.toString());
        formData.append('totalChunks', totalChunks.toString());

        xhr.send(formData);
      });
    }

    return { success: true, totalChunks };
  };
}
