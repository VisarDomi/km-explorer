import { ytboob } from './ytb';
import type { Provider } from './types';

const providers: Provider[] = [ytboob];

export function providerFor(url: URL = new URL(window.location.href)): Provider | null {
    return providers.find(provider => provider.hostname === url.hostname) ?? null;
}

export type { ActorVideoPage, ListingResult, Provider, ProviderRoute } from './types';
