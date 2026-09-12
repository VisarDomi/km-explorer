import workerCode from '@worker-code';
import { native } from './native';
let worker: Worker | undefined;
let sequence = 0;
let active = true;
let workerURL: string | undefined;
const pending = new Map<number, {resolve:(value:any)=>void;reject:(error:Error)=>void}>();
// Cached documents must not retain an IDB transaction that blocks the next
// document. Match the gallery app's worker lifetime; recreate on Back as needed.
addEventListener('pagehide', () => {
    active = false; worker?.terminate(); worker = undefined;
    if (workerURL) URL.revokeObjectURL(workerURL);
    workerURL = undefined;
    for (const item of pending.values()) item.reject(new Error('Document suspended'));
    pending.clear();
});
addEventListener('pageshow', () => { active = true; });
export function compute<T>(op: string, ...args: unknown[]): Promise<T> {
    if (!active) return op === 'scroll-save' ? Promise.resolve(undefined as T) : Promise.reject(new Error('Document suspended'));
    if (!worker) {
        const url = URL.createObjectURL(new Blob([workerCode], {type:'text/javascript'}));
        workerURL = url;
        const current = worker = new Worker(url);
        current.onmessage = async ({data}) => {
            if (data.networkId) {
                try { const result = await native('fetch',data.request); if (worker === current) current.postMessage({networkId:data.networkId,result}); }
                catch (error) { if (worker === current) current.postMessage({networkId:data.networkId,error:String(error)}); }
                return;
            }
            const item = pending.get(data.id); pending.delete(data.id);
            if (data.ok) item?.resolve(data.value); else item?.reject(new Error(data.error));
        };
        current.onerror = event => {
            for (const item of pending.values()) item.reject(new Error(event.message));
            pending.clear(); current.terminate(); URL.revokeObjectURL(url); worker = undefined;
        };
    }
    return new Promise((resolve,reject) => {
        const id = ++sequence; pending.set(id,{resolve,reject}); worker!.postMessage({id,op,args});
    });
}
