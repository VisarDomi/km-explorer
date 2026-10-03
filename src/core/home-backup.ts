import { installHomeBackup } from './pc-backup';
import { compute } from './compute/transport';
export function startHomeBackup(): void {
    const run = installHomeBackup({ app: 'ytb', provider: 'ytboob', call: command => compute('backup-control', command) });
    void run();
}
