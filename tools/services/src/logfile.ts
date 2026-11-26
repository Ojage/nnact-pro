// A size-capped log file: past `maxBytes` it rotates to name.log.1 ... .keep
// and the oldest is dropped.
import { closeSync, existsSync, fstatSync, openSync, renameSync, rmSync, writeSync } from "node:fs";

export class RotatingLog {
  private fd: number;
  private size: number;
  private readonly path: string;
  private readonly maxBytes: number;
  private readonly keep: number;

  constructor(path: string, maxBytes: number, keep: number) {
    this.path = path;
    this.maxBytes = maxBytes;
    this.keep = keep;
    this.fd = openSync(path, "a", 0o600);
    this.size = fstatSync(this.fd).size;
  }

  write(text: string): void {
    const bytes = Buffer.byteLength(text);
    if (this.size > 0 && this.size + bytes > this.maxBytes) this.rotate();
    writeSync(this.fd, text);
    this.size += bytes;
  }

  close(): void {
    closeSync(this.fd);
  }

  private rotate(): void {
    closeSync(this.fd);
    rmSync(`${this.path}.${this.keep}`, { force: true });
    for (let index = this.keep - 1; index >= 1; index -= 1) {
      const from = `${this.path}.${index}`;
      if (existsSync(from)) renameSync(from, `${this.path}.${index + 1}`);
    }
    renameSync(this.path, `${this.path}.1`);
    this.fd = openSync(this.path, "a", 0o600);
    this.size = 0;
  }
}
