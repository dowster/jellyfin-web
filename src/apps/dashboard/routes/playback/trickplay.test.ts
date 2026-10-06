import { beforeEach, describe, expect, it, vi } from 'vitest';

import { action } from './trickplay';

const mocks = vi.hoisted(() => ({
    getConfiguration: vi.fn(),
    updateConfiguration: vi.fn(),
    invalidateQueries: vi.fn()
}));

vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: { getApi: () => ({}) } }));
vi.mock('lib/globalize', () => ({ default: { translate: (key: string) => key } }));
vi.mock('@jellyfin/sdk/lib/utils/api/system-api', () => ({ getSystemApi: () => mocks }));
vi.mock('utils/query/queryClient', () => ({ queryClient: mocks }));
vi.mock('hooks/useConfiguration', () => ({ ['QUERY_KEY']: [ 'configuration' ], useConfiguration: vi.fn() }));
vi.mock('components/Page', () => ({ default: vi.fn() }));
vi.mock('components/loading/LoadingComponent', () => ({ default: vi.fn() }));

const submit = (concurrency?: string) => {
    const fields: Record<string, string> = {
        ScanBehavior: 'NonBlocking', ProcessPriority: 'BelowNormal', ImageInterval: '10000',
        WidthResolutions: '320', TileWidth: '10', TileHeight: '10', Qscale: '4',
        JpegQuality: '90', TrickplayThreads: '2'
    };
    if (concurrency !== undefined) fields.MaxConcurrentJobs = concurrency;

    const formData = new FormData();
    Object.entries(fields).forEach(([key, value]) => {
        formData.set(key, value);
    });

    return action({
        request: { formData: async () => formData } as Request,
        params: {},
        context: {}
    });
};

describe('trickplay concurrency configuration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getConfiguration.mockResolvedValue({ data: { TrickplayOptions: { MaxConcurrentJobs: 1 } } });
        mocks.updateConfiguration.mockResolvedValue({});
    });

    it('saves job concurrency independently of FFmpeg threads', async () => {
        await expect(submit('3')).resolves.toEqual({ isSaved: true });
        expect(mocks.updateConfiguration).toHaveBeenCalledWith({
            serverConfiguration: {
                TrickplayOptions: expect.objectContaining({ MaxConcurrentJobs: 3, ProcessThreads: 2 })
            }
        });
    });

    it('defaults to one when the new field is absent', async () => {
        await submit();
        expect(mocks.updateConfiguration).toHaveBeenCalledWith({
            serverConfiguration: { TrickplayOptions: expect.objectContaining({ MaxConcurrentJobs: 1 }) }
        });
    });

    it.each([ '0', '-1', '33', '1.5', 'NaN', '' ])('rejects invalid concurrency %s before saving', async value => {
        await expect(submit(value)).rejects.toThrow('TrickplayConcurrencyInvalid');
        expect(mocks.updateConfiguration).not.toHaveBeenCalled();
    });
});
