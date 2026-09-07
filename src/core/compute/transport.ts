import WorkerConstructor from './worker-entry?worker&inline';
let worker: Worker | undefined;
let sequence = 0;
const pending = new Map<number, { resolve(value: any): void; reject(error: Error): void }>();
export function compute<T>(op: string, ...args: unknown[]): Promise<T> {
    return new Promise((resolve, reject) => {
        if (!worker) {
            worker = new WorkerConstructor();
            worker.onmessage = ({ data }) => {
                const task = pending.get(data.id);
                if (!task) return;
                pending.delete(data.id);
                if (data.ok) task.resolve(data.value); else task.reject(new Error(data.error));
            };
            worker.onerror = error => {
                for (const task of pending.values()) task.reject(new Error(error.message));
                pending.clear(); worker?.terminate(); worker = undefined;
            };
            // Install only after route recognition and takeover. Workers have no pagehide event.
            window.addEventListener('pagehide', () => {
                worker?.postMessage({ id: 0, op: 'suspend' });
            });
        }
        const id = ++sequence;
        pending.set(id, { resolve, reject });
        worker.postMessage({ id, op, args });
    });
}
