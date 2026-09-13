import { installFetch } from './fetch';
import '../../../src/core/compute/worker-entry';
let next = 0;
const pending = new Map<number, {resolve:(value:any)=>void;reject:(error:Error)=>void}>();
installFetch(request => new Promise((resolve,reject) => {
    const networkId = ++next; pending.set(networkId,{resolve,reject});
    postMessage({networkId,request});
}), requestID => postMessage({cancelRequest:requestID}));
addEventListener('message', ({data}) => {
    if (!data.networkId) return;
    const item = pending.get(data.networkId); pending.delete(data.networkId);
    if (data.error) item?.reject(new Error(data.error)); else item?.resolve(data.result);
});
