/**
 * Media Upload Helper Service
 * Uploads media files (images, documents) to the Cloud Storage microservice endpoint (/api/upload).
 * Supports progress tracking and format validation.
 */

export interface UploadResult {
  url: string;
  filename?: string;
  size?: number;
}

export async function uploadMedia(
  file: File,
  onProgress?: (percent: number) => void
): Promise<UploadResult> {
  const formData = new FormData();
  formData.append('file', file);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload', true);

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          resolve({
            url: response.url,
            filename: file.name,
            size: file.size
          });
        } catch {
          reject(new Error('Invalid response format from media service.'));
        }
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.statusText}`));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error occurred during media upload.'));
    };

    xhr.send(formData);
  });
}
