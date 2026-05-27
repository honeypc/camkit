// Plugin System Life-Cycle Hook Runner
import { CamKitPlugin, UploadTask } from '@camkit/types';

export class PluginManager {
  private plugins: CamKitPlugin[] = [];

  public register(plugin: CamKitPlugin) {
    this.plugins.push(plugin);
    if (plugin.setup) {
      plugin.setup(this);
    }
  }

  public async runOnCapture(blob: Blob): Promise<Blob> {
    let currentBlob = blob;
    for (const plugin of this.plugins) {
      if (plugin.hooks?.onCapture) {
        currentBlob = await plugin.hooks.onCapture(currentBlob);
      }
    }
    return currentBlob;
  }

  public async runBeforeProcess(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<void> {
    for (const plugin of this.plugins) {
      if (plugin.hooks?.beforeProcess) {
        await plugin.hooks.beforeProcess(canvas);
      }
    }
  }

  public async runAfterProcess(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<void> {
    for (const plugin of this.plugins) {
      if (plugin.hooks?.afterProcess) {
        await plugin.hooks.afterProcess(canvas);
      }
    }
  }

  public async runBeforeUpload(task: UploadTask): Promise<UploadTask> {
    let currentTask = task;
    for (const plugin of this.plugins) {
      if (plugin.hooks?.beforeUpload) {
        currentTask = await plugin.hooks.beforeUpload(currentTask);
      }
    }
    return currentTask;
  }
}
